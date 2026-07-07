import * as cheerio from 'cheerio'; 
import axios from 'axios'; 

async function run() { 
  try {
    const listRes = await axios.get('https://tendersodisha.gov.in/nicgep/app?page=FrontEndLatestActiveTenders&service=page'); 
    const cookies = listRes.headers['set-cookie']?.map(c => c.split(';')[0]).join('; '); 
    const $list = cheerio.load(listRes.data); 
    const link = $list('a[href*=\'component=%24DirectLink\']').first().attr('href'); 
    if (!link) return console.log("No link"); 
    
    const detailUrl = 'https://tendersodisha.gov.in/nicgep/' + link.replace(/&amp;/g, '&'); 
    console.log("Details:", detailUrl);
    const detailRes = await axios.get(detailUrl, { headers: { Cookie: cookies } }); 
    const $d = cheerio.load(detailRes.data); 
    
    console.log('All links inside tables:'); 
    $d('table a').each((i, el) => console.log($d(el).text().trim(), $d(el).attr('href'))); 
  } catch(e: any) {
    console.log(e.message);
  }
} 
run();
