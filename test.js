const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors']
  });
  const page = await browser.newPage();
  try {
    await page.goto('https://tenders.wb.gov.in/nicgep/app', { waitUntil: 'domcontentloaded' });
    const inputs = await page.$$('input[type="text"]');
    await inputs[0].type('2026_WBPWD_5016528_22');
    
    const searchBtns = await page.$$("::-p-xpath(//input[@value='Go' or @value='Search' or @type='submit' or @type='image'])");
    await searchBtns[0].click();
    await page.waitForNavigation({ waitUntil: 'domcontentloaded' });
    
    const rowHTML = await page.evaluate(() => {
      const td = Array.from(document.querySelectorAll('td')).find(t => t.textContent.includes('2026_WBPWD_5016528_22'));
      return td ? td.parentElement.innerHTML : 'Not found';
    });
    console.log("Row HTML:\n", rowHTML);
  } finally {
    await browser.close();
  }
})();
