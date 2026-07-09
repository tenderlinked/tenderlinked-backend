const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const files = fs.readdirSync('debug').filter(f => f.startsWith('error-') && f.endsWith('.html')).sort().reverse();
if (files.length === 0) {
  console.log('No HTML error files found.');
  process.exit(0);
}

const filename = files[0];
const content = fs.readFileSync(path.join('debug', filename), 'utf8');
const $ = cheerio.load(content);

console.log('--- Analyzing:', filename, '---');
console.log('H1/H2/H3:', $('h1, h2, h3').map((i, el) => $(el).text().trim()).get());
console.log('Table class td_caption count:', $('.td_caption').length);
console.log('All links with DirectLink:', $('a[id^="DirectLink"]').map((i, el) => `${$(el).attr('id')}: ${$(el).text().trim()}`).get());
console.log('Body snippet:', $('body').text().replace(/\s+/g, ' ').substring(0, 1000));
