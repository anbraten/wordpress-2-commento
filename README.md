# wordpress-2-commento
Converts wordpress comments to commento format

# Guide
1. `yarn install`
2. Go to you Wordpress site and export your comments 
    - `https://your-wordpress-page.com/wp-admin/export.php`
    - Select `Posts` and the desired date-range
3. Move downloaded XML-file to this project and name it `wordpress.xml`
4. Run `yarn convert`
5. Upload `commento.json.gz` to some website (for example `file.io`)
6. Goto commento settings and import comments via commento import from url
