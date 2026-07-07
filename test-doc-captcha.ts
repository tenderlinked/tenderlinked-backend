import axios from 'axios';
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import { SessionService } from './src/scraper/session.service';
import * as dotenv from 'dotenv';
dotenv.config();

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const BASE_URL = "https://tendersodisha.gov.in";

async function run() {
  try {
    const sessionService = new SessionService();
    const cookieStr = await sessionService.getValidSessionCookie();
    
    if (!cookieStr) {
      console.error("Failed to get session cookie");
      return;
    }
    
    // 1. Fetch organization tenders list
    console.log("Fetching organization tenders...");
    const listUrl = `${BASE_URL}/nicgep/app?component=%24DirectLink&page=FrontEndTendersByOrganisation&service=direct&session=T&sp=SbZl%2FYnF84R04J1Q4H8XfRw%3D%3D`;
    const pageRes = await axios.get(listUrl, {
      headers: { "User-Agent": USER_AGENT, "Cookie": cookieStr }
    });
    
    const $list = cheerio.load(pageRes.data);
    const firstTenderHref = $list("table#table tr.even td").eq(4).find("a").attr("href") || $list("table#table tr.odd td").eq(4).find("a").attr("href");
    
    if (!firstTenderHref) {
      console.error("Could not find a tender detail link.");
      return;
    }
    
    const detailUrl = firstTenderHref.startsWith('http') ? firstTenderHref : `${BASE_URL}${firstTenderHref.replace(/&amp;/g, '&')}`;
    console.log("Fetching detail page:", detailUrl);
    
    // 2. Fetch detail page
    const detailRes = await axios.get(detailUrl, {
      headers: { "User-Agent": USER_AGENT, "Cookie": cookieStr }
    });
    const $d = cheerio.load(detailRes.data);
    
    let pdfUrl = "";
    $d("table a").each((i, el) => {
      const linkHref = $d(el).attr('href') || "";
      if (linkHref.includes('component=%24DirectLink')) {
         pdfUrl = linkHref.startsWith('http') ? linkHref : `${BASE_URL}${linkHref.startsWith('/') ? '' : '/nicgep/'}${linkHref}`;
      }
    });
    
    if (!pdfUrl) {
      console.error("No PDF link found.");
      return;
    }
    
    console.log("Fetching PDF URL (Expect Captcha):", pdfUrl);
    const pdfInitRes = await axios.get(pdfUrl, {
      headers: { "User-Agent": USER_AGENT, "Cookie": cookieStr },
      responseType: 'arraybuffer' // In case it's actually a PDF
    });
    
    const contentType = (pdfInitRes.headers['content-type'] as string) || "";
    if (contentType.includes('application/pdf')) {
      console.log("SUCCESS! No captcha required for document!");
      fs.writeFileSync('test_doc.pdf', pdfInitRes.data);
      return;
    }
    
    console.log("Got HTML (Captcha expected). Parsing...");
    const htmlString = Buffer.from(pdfInitRes.data).toString('utf-8');
    const $c = cheerio.load(htmlString);
    
    const captchaImg = $c('img#captchaImage').attr('src');
    if (!captchaImg) {
      console.error("No captcha image found in the HTML!");
      fs.writeFileSync('error_captcha_page.html', htmlString);
      return;
    }
    
    console.log("Found Document Captcha Image:", captchaImg);
    // Write the HTML for debugging
    fs.writeFileSync('captcha_form.html', htmlString);
    
  } catch (err: any) {
    console.error("Error:", err.message);
  }
}
run();
