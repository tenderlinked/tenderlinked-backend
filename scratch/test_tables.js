const fs = require('fs');
const html = fs.readFileSync('ap_dump_after_more.html', 'utf8');
const matches = html.match(/<table[^>]+id="([^"]+)"/g);
console.log(matches);
