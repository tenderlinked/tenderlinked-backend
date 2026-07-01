import * as cheerio from "cheerio";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { ParsedTender } from "./types";

dayjs.extend(customParseFormat);

export function parseTenderPage(html: string, district: string, sourceUrl: string): ParsedTender[] {
  const $ = cheerio.load(html);
  const tenders: ParsedTender[] = [];

  $("table tbody tr").each((_, row) => {
    const cells = $(row).find("td");

    if (cells.length >= 3) {
      let cIdx = 0;
      // If the first cell is purely a number (Sr. No.), skip it
      if ($(cells[0]).text().trim().match(/^\d+$/)) {
        cIdx = 1;
      }

      let title = $(cells[cIdx]).text().trim();

      // Some districts (e.g. Mayurbhanj) have an empty Title column;
      // the actual tender name is in the next cell (Description column).
      // If title is empty, scan forward to find the first non-empty, non-date cell.
      if (!title) {
        for (let k = cIdx + 1; k < cells.length; k++) {
          const candidate = $(cells[k]).text().trim();
          if (candidate && !candidate.match(/^\d{2}[\/\-]\d{2}[\/\-]\d{4}/) && candidate.length > 5) {
            title = candidate;
            cIdx = k; // advance index so remaining cells are read correctly
            break;
          }
        }
      }

      let description: string | null = null;
      let startDate: Date | null = null;
      let endDate: Date | null = null;

      const remainingTexts: string[] = [];
      for (let i = cIdx + 1; i < cells.length; i++) {
        remainingTexts.push($(cells[i]).text().trim());
      }

      // Regex to match Indian date formats
      const dateRegexStr = "\\d{2}[\\/\\-]\\d{2}[\\/\\-]\\d{4}";
      const dateRegexGlobal = new RegExp(dateRegexStr, "g");

      const combinedText = remainingTexts.join(" ");
      const dateMatches = combinedText.match(dateRegexGlobal);

      let startDateStr = "";
      let endDateStr = "";

      if (dateMatches) {
        if (dateMatches.length >= 2) {
          startDateStr = dateMatches[0];
          endDateStr = dateMatches[1]; // Use the second date found, not the last
        } else {
          endDateStr = dateMatches[0]; // If only one date, it's the closing date
        }
      }

      const nonDateTexts = remainingTexts.filter((text) =>
        !text.match(new RegExp(dateRegexStr)) &&
        text.length > 0 &&
        !text.toLowerCase().includes("kb)") &&
        !text.toLowerCase().includes("mb)") &&
        !text.toLowerCase().includes("download")
      );

      if (nonDateTexts.length > 0 && nonDateTexts[0] !== title) {
        description = nonDateTexts[0];
      }

      // Use strict parsing for dayjs
      if (startDateStr) {
        const parsed = dayjs(startDateStr, ["DD/MM/YYYY", "DD-MM-YYYY", "YYYY-MM-DD"], true);
        if (parsed.isValid()) startDate = parsed.toDate();
      }

      if (endDateStr) {
        const parsed = dayjs(endDateStr, ["DD/MM/YYYY", "DD-MM-YYYY", "YYYY-MM-DD"], true);
        if (parsed.isValid()) endDate = parsed.toDate();
      }

      // Find Document links in the row
      const links: string[] = [];
      const validExtensions = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".zip", ".rar", ".7z"];
      $(row)
        .find("a")
        .each((_, a) => {
          const href = $(a).attr("href");
          if (href && validExtensions.some((ext) => href.toLowerCase().endsWith(ext))) {
            try {
              const absoluteUrl = new URL(href, sourceUrl).toString();
              links.push(absoluteUrl);
            } catch (e) {
              // invalid url
            }
          }
        });

      let noticePdfUrl: string | null = null;
      let tenderPdfUrl: string | null = null;

      if (links.length > 0) {
        noticePdfUrl = links[0];
      }
      if (links.length > 1) {
        tenderPdfUrl = links[1];
      } else if (links.length === 1) {
        tenderPdfUrl = links[0];
        noticePdfUrl = null;
      }

      if (title && (tenderPdfUrl || noticePdfUrl)) {
        tenders.push({
          district,
          title,
          description,
          startDate,
          endDate,
          noticePdfUrl,
          tenderPdfUrl,
          sourceUrl,
        });
      }
    }
  });

  return tenders;
}
