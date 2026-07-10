import * as cheerio from 'cheerio';
const html = `<table><tr><td class="td_caption" width="30%" valign="top">EMD Amount in ₹</td><td class="td_field" valign="top">1,12,170</td></tr></table>`;
const $d = cheerio.load(html);
let d: Record<string, string> = {};
$d('.td_caption').each((i, el) => { 
  const key = $d(el).text().replace(/\s+/g, ' ').trim(); 
  const nextTd = $d(el).next('td'); 
  if (nextTd.length) d[key] = nextTd.text().trim(); 
}); 
console.log("td_caption extraction:", d);

let d2: Record<string, string> = {};
$d("table tr").each((_idx, tr) => {
  const tds = $d(tr).find("> td, > th");
  if (tds.length === 2 || tds.length === 4) {
    for (let i = 0; i < tds.length; i += 2) {
      const key = $d(tds[i]).text().replace(/\s+/g, " ").trim();
      const val = $d(tds[i + 1]).text().replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
      if (key && val) d2[key] = val;
    }
  }
});
console.log("tr extraction:", d2);
