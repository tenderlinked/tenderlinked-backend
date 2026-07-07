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
    console.log("1. Fetching valid session via SessionService...");
    const sessionService = new SessionService();
    const cookieStr = await sessionService.getValidSessionCookie();
    
    if (!cookieStr) {
      console.error("Failed to get session cookie");
      return;
    }
    console.log("Session Cookie obtained");

    console.log("2. Fetching tenders list...");
    const listUrl = `${BASE_URL}/nicgep/app?component=%24DirectLink&page=FrontEndTendersByOrganisation&service=direct&session=T&sp=SbZl%2FYnF84R04J1Q4H8XfRw%3D%3D`;
    
    const pageRes = await axios.get(listUrl, {
      headers: { "User-Agent": USER_AGENT, "Cookie": cookieStr }
    });
    const $list = cheerio.load(pageRes.data);
    const firstTenderHref = $list("table#table tr.even td").eq(4).find("a").attr("href") || $list("table#table tr.odd td").eq(4).find("a").attr("href");
    
    if (!firstTenderHref) {
      console.error("Could not find a tender to click on.");
      return;
    }

    const detailUrl = firstTenderHref.startsWith('http') ? firstTenderHref : `${BASE_URL}${firstTenderHref.replace(/&amp;/g, '&')}`;
    console.log("2. Fetching detail page:", detailUrl);

    const detailRes = await axios.get(detailUrl, {
      headers: { "User-Agent": USER_AGENT, "Cookie": cookieStr }
    });

    const $detail = cheerio.load(detailRes.data);
    const downloadZipHref = $detail('a[id="docDownload"]').attr('href') || $detail('a').filter((i, el) => $(el).text().toLowerCase().includes('download as zip')).attr('href');

    if (!downloadZipHref) {
      console.error("Could not find download link on detail page.");
      return;
    }

    const downloadUrl = downloadZipHref.startsWith('http') ? downloadZipHref : `${BASE_URL}${downloadZipHref.replace(/&amp;/g, '&')}`;
    console.log("3. Fetching download page (which should contain captcha):", downloadUrl);

    const downloadRes = await axios.get(downloadUrl, {
      headers: { "User-Agent": USER_AGENT, "Cookie": cookieStr }
    });

    const $ = cheerio.load(downloadRes.data);
    
    // Find the captcha image element explicitly
    const captchaElement = $('img#captchaImage');
    let captchaImgSrc = captchaElement.attr('src');

    if (!captchaImgSrc) {
      // Fallback: look for any img containing 'Captcha' in src
      captchaImgSrc = $('img').filter((i, el) => {
        const src = $(el).attr('src') || '';
        return src.toLowerCase().includes('captcha');
      }).attr('src');
    }

    if (!captchaImgSrc) {
      console.error("Could not find captcha image on the page.");
      $('img').each((i, el) => console.log("Found img:", $(el).attr('src')));
      return;
    }

    console.log("2. Found captcha image source:", captchaImgSrc);
    
    // The src might be relative
    const captchaUrl = captchaImgSrc.startsWith('http') ? captchaImgSrc : `${BASE_URL}${captchaImgSrc.startsWith('/') ? '' : '/'}${captchaImgSrc}`;
    console.log("Fetching captcha image from:", captchaUrl);

    // Fetch the image as a buffer using the session cookie
    const imgRes = await axios.get(captchaUrl, {
      headers: { 
        "User-Agent": USER_AGENT,
        "Cookie": cookieStr
      },
      responseType: 'arraybuffer'
    });

    const outputPath = path.join(__dirname, 'captcha-sample.png');
    fs.writeFileSync(outputPath, imgRes.data);
    console.log(`\nSUCCESS! Captcha image downloaded and saved to: ${outputPath}`);
    
  } catch (error: any) {
    console.error("Error occurred:", error.message);
  }
}

run();
