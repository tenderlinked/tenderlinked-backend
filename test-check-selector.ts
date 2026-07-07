import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';

function run() {
  const html = fs.readFileSync(path.join(process.cwd(), 'before-b9ac16f7-dd42-4bfc-bab0-6fc9108de6c7.html'), 'utf-8');
  const $ = cheerio.load(html);
  
  const links: any[] = [];
  $('a').each((i, el) => {
    links.push({
      text: $(el).text().trim(),
      href: $(el).attr('href') || '',
      id: $(el).attr('id') || ''
    });
  });
  
  console.log(`Found ${links.length} total links.`);
  
  // Try to find using our logic
  const found = links.find(l => {
    const text = l.text.toLowerCase();
    const href = l.href;
    const matchesHref = href.includes('docDownoad') || href.includes('docDownload') || href.includes('DirectLink_0') || href.includes('DirectLink_0_0');
    const matchesText = text.endsWith('.pdf') || text.includes('notice') || text.includes('tender');
    return matchesHref && matchesText;
  });
  
  console.log('Found link:', found);
  
  // List all links containing 'DirectLink' or 'docDown' or '.pdf'
  const matches = links.filter(l => {
    const text = l.text.toLowerCase();
    const href = l.href.toLowerCase();
    return text.includes('pdf') || href.includes('directlink') || href.includes('docdown');
  });
  console.log('\nAll potential download links:');
  console.log(JSON.stringify(matches, null, 2));
}

run();
