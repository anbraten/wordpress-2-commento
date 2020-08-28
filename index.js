const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');
const crypto = require('crypto');
const moment = require('moment');
const gzip = require('./gzip');

const commentoData = {
  version: 1,
  comments: [],
  commenters: [],
};
const commentIdMap = {};

function parseExport(file) {
  const parser = new xml2js.Parser();

  return new Promise((resolve, reject) => {
    fs.readFile(path.resolve(__dirname, file), (err, data) => {
      if (err) {
        reject(err);
        return;
      }

      parser.parseString(data, (err, result) => {
        if (err) {
          reject(err);
          return;
        }  

        resolve(result);
      });
    });
  })
}

async function writeExport(file, data) {
  const filePath = path.resolve(__dirname, file);

  return new Promise((resolve, reject) => {
    fs.writeFile(filePath, data, (err) => {
      if (err) {
        reject(err);
        return;
      }

      resolve();

      gzip(filePath);
    });
  });
}

function getMissingKeys(obj, keys) {
  const missingKeys = [];

  for (const key of keys) {
    if (obj[key] === undefined) {
      missingKeys.push(key);
    }
  }

  return missingKeys;
}

function createKey() {
  return new Promise((resolve, reject) => {
    crypto.randomBytes(32, (err, buffer) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(buffer.toString('hex'));
    });  
  });
}

async function addComment(_comment) {
  const missingKeys = getMissingKeys(_comment, ['domain', 'url', 'commenterHex', 'parentHex', 'creationDate', 'markdown'])
  if (missingKeys.length > 0) {
    console.log('missing keys', missingKeys, _comment, );
    return null;
  }

  const commentHex = await createKey();

  const comment = {
    commentHex,
    html: '',
    score: 0,
    state: 'approved',
    direction: 0,
    deleted: false,
    ..._comment,
  };

  commentoData.comments.push(comment);

  return comment;
}

function getCommenter(email) {
  const commenters = commentoData.commenters.filter(commenter => commenter.email === email);
  return commenters[0] || null;
}

async function addCommenter(_commenter) {
  const missingKeys = getMissingKeys(_commenter, ['email', 'name'])
  if (missingKeys.length > 0) {
    console.log('missing keys', missingKeys, _commenter, );
    return null;
  }

  let commenter = getCommenter(_commenter.email);
  
  if (commenter) {
    return commenter;
  }

  commenter = {
    commenterHex: await createKey(),
    link: 'undefined',
    photo: 'undefined',
    provider: "commento",
    joinDate: new Date().toISOString(),
    isModerator: false,
    ..._commenter,
  };

  commentoData.commenters.push(commenter);

  return commenter;
}

async function convert(fromFile, toFile) {
  const data = await parseExport(fromFile);
  const wp = data.rss.channel[0];
  const domain = wp.link[0].replace(new RegExp('^[a-z]*://'), '');

  for (const item of wp.item) {
    if (!item['wp:comment']) {
      continue;
    }

    const comments = item['wp:comment'];
    const url = item.link[0].replace(new RegExp(`^[a-z]*://${domain}`), '');
    console.log(url, comments.length);

    for (const comment of comments) {
      if (comment['wp:comment_type'][0] !== 'comment') {
        continue;
      }

      const commenter = await addCommenter({
        name: comment['wp:comment_author'][0],
        email: comment['wp:comment_author_email'][0],
        link: comment['wp:comment_author_url'][0] || 'undefined',
      });

      const content = comment['wp:comment_content'][0].replace('\r\n', '\n').replace(/<[^>]*>?/gm, '');
      const state = comment['wp:comment_approved'][0] === '1' ? 'approved' : null;
      const parentId = comment['wp:comment_parent'][0];
      const parentHex = (parentId === '0') ? 'root' : commentIdMap[parentId];
      // improve handling if parent gets add after childs

      const c = await addComment({
        domain,
        url,
        state,
        parentHex,
        creationDate: moment(comment['wp:comment_date'][0]).toISOString(),
        commenterHex: commenter.commenterHex,
        markdown: content,
      });

      commentIdMap[comment['wp:comment_id'][0]] = c.commentHex;
    }
  }

  await writeExport(toFile, JSON.stringify(commentoData, null, 4));
}

convert('wordpress.xml', 'commento.json');

