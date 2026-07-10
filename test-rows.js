const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./dist/app.module');
const { SessionService } = require('./dist/scraper/session.service');
const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const sessionService = app.get(SessionService);
  const baseUrl = 'https://tendersodisha.gov.in';
  
  console.log('Fetching session...');
  const cookieStr = await sessionService.getValidSessionCookie(baseUrl);
  console.log('Got cookie:', cookieStr);

  const url = `${baseUrl}/nicgep/app?component=%24DirectLink&page=FrontEndTendersByOrganisation&service=direct&session=T&sp`;
  const res = await axios.get(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Cookie": cookieStr || ""
    }
  });

  const $ = cheerio.load(res.data);
  const rows = $("table#table tr.even, table#table tr.odd").toArray();
  console.log(`Found ${rows.length} rows.`);

  await app.close();
  process.exit(0);
}
test().catch(console.error);
