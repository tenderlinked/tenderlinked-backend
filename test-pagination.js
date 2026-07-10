const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
  const baseUrl = 'https://tendersodisha.gov.in';
  const url = `${baseUrl}/nicgep/app?component=%24DirectLink&page=FrontEndTendersByOrganisation&service=direct&session=T&sp`;
  
  const res = await axios.get(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
  });

  const $ = cheerio.load(res.data);
  const rows = $("table#table tr.even, table#table tr.odd").toArray();
  console.log(`Found ${rows.length} rows.`);

  const links = [];
  $('a').each((i, el) => {
    const text = $(el).text().trim();
    const href = $(el).attr('href');
    if (text === 'Next' || text === 'Next Page' || /^[0-9]+$/.test(text)) {
      links.push({ text, href });
    }
  });
  console.log('Pagination links:', links);
}
test().catch(console.error);
