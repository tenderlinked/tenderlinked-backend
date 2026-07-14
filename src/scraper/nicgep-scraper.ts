import axios from "axios";
import * as cheerio from "cheerio";
import * as fs from "fs";
import * as path from "path";
import { PrismaService } from "../prisma/prisma.service";
import { ScrapeResult, ScrapeStatus, TenderSchema } from "./types";
import { randomDelay } from "./queue";
import { SessionService } from "./session.service";
import { ScraperTargetsService } from "./scraper-targets.service";
import { cleanCityName, parseAmount, extractLocationInfo } from "./utils";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ─── Helpers ────────────────────────────────────────────────────────────────

function toTitleCase(str: string | null | undefined): string {
  if (!str) return "";
  return str.replace(/\w\S*/g, function(txt) {
    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
  });
}

/**
 * Parse NICGEP date strings like "07-Jul-2026 06:01 PM" or "07-Jul-2026" into Date objects.
 * Returns null if the string is empty or unparseable.
 */
function parseNicgepDate(str: string | undefined | null): Date | null {
  if (!str) return null;
  const cleaned = str.replace(/\u00a0/g, " ").trim();
  if (!cleaned || cleaned === "NA" || cleaned === "N/A") return null;
  try {
    const d = new Date(cleaned);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

/** Convert "Yes"/"No" strings to booleans. Returns null if ambiguous. */
function parseBoolean(str: string | undefined | null): boolean | null {
  if (!str) return null;
  const lower = str.trim().toLowerCase();
  if (lower === "yes") return true;
  if (lower === "no") return false;
  return null;
}

/** Parse integer strings, returns null on failure */
function parseIntOrNull(str: string | undefined | null): number | null {
  if (!str) return null;
  const cleaned = str.replace(/\u00a0/g, "").trim();
  const n = parseInt(cleaned, 10);
  return isNaN(n) ? null : n;
}

/** Normalize a whitespace-heavy string (trim + collapse internal spaces) */
function norm(str: string | undefined | null): string | null {
  if (!str) return null;
  const s = str.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  if (s.length === 0) return null;
  
  const lower = s.toLowerCase();
  if (
    lower === "na" ||
    lower === "n/a" ||
    lower === "nil" ||
    lower === "null" ||
    lower === "none" ||
    lower === "not applicable" ||
    lower === "-" ||
    lower === "--"
  ) {
    return null;
  }
  return s;
}

/**
 * Get standard 2-letter state abbreviation by checking RegionState table in DB,
 * with standard Indian state map as fallback.
 */
async function getStateAbbr(prisma: PrismaService, stateName: string): Promise<string> {
  const clean = stateName.trim().toLowerCase();
  try {
    const states = await prisma.regionState.findMany({ select: { name: true, code: true } });
    for (const s of states) {
      if (s.code && (clean.includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(clean))) {
        return s.code;
      }
    }
  } catch (e) {
    // ignore db lookup error and fall back
  }

  // Fallback map
  const fallback: Record<string, string> = {
    'andhra': 'AP', 'arunachal': 'AR', 'assam': 'AS', 'bihar': 'BR',
    'chandigarh': 'CH', 'chhattisgarh': 'CG', 'dadra': 'DN', 'daman': 'DD',
    'delhi': 'DL', 'goa': 'GA', 'gujarat': 'GJ', 'haryana': 'HR',
    'himachal': 'HP', 'jammu': 'JK', 'jharkhand': 'JH', 'karnataka': 'KA',
    'kerala': 'KL', 'lakshadweep': 'LD', 'madhya': 'MP', 'maharashtra': 'MH',
    'manipur': 'MN', 'meghalaya': 'ML', 'mizoram': 'MZ', 'nagaland': 'NL',
    'odisha': 'OD', 'puducherry': 'PY', 'punjab': 'PB', 'rajasthan': 'RJ',
    'sikkim': 'SK', 'tamil': 'TN', 'telangana': 'TS', 'tripura': 'TR',
    'uttarakhand': 'UK', 'uttar': 'UP', 'west bengal': 'WB'
  };
  for (const [k, code] of Object.entries(fallback)) {
    if (clean.includes(k)) return code;
  }

  // Default to first 2 characters uppercase
  return stateName.trim().substring(0, 2).toUpperCase();
}

/**
 * Generate a human-readable tender reference code with per-state numbering.
 * Format: TL-{StateAbbr}-{6-digit-sequence}
 * Examples: TL-OD-000001, TL-AP-000001, TL-MH-000001
 */
async function generateTenderCode(prisma: PrismaService, stateName: string): Promise<string> {
  const abbr = await getStateAbbr(prisma, stateName);
  const prefix = `TL-${abbr}-`;

  const lastTender = await prisma.tender.findFirst({
    where: {
      tenderCode: {
        startsWith: prefix,
      },
    },
    orderBy: {
      tenderCode: 'desc',
    },
    select: {
      tenderCode: true,
    },
  });

  let nextNum = 1;
  if (lastTender?.tenderCode) {
    const parts = lastTender.tenderCode.split('-');
    const lastNum = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastNum)) {
      nextNum = lastNum + 1;
    }
  }
  const padded = String(nextNum).padStart(6, '0');
  return `${prefix}${padded}`;
}

// ─── Scraper ─────────────────────────────────────────────────────────────────

export async function scrapeStateTenders(
  prisma: PrismaService,
  sessionService: SessionService,
  target: { id?: string; name: string; url: string; regionStateId?: string | null; regionDistrictId?: string | null; type?: string },
  source: string = "AUTO",
  getStatus: () => ScrapeStatus = () => "RUNNING",
  onProgress?: (found: number, added: number) => void
): Promise<ScrapeResult> {
  const targetRegion = target.name;
  const stateSlug = targetRegion
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  let newTendersCount = 0;

  const baseUrlMatch = target.url.match(/^(https?:\/\/[^/]+)/);
  const baseUrl = baseUrlMatch
    ? baseUrlMatch[1]
    : target.url.split("/nicgep")[0];

  const scrapeLog = await prisma.scrapeLog.create({
    data: {
      targetId: target.id,
      targetRegion: target.name,
      status: "RUNNING",
      tendersFound: 0,
      source,
    },
  });

  const allValidTenders: any[] = [];

  try {
    // Resolve Region IDs
    let regionStateId: string | null = target.regionStateId || null;
    let regionDistrictId: string | null = target.regionDistrictId || null;
    
    if (!regionStateId) {
      const dbState = await prisma.regionState.findFirst({
        where: { name: { contains: targetRegion, mode: "insensitive" } }
      });
      if (dbState) {
        regionStateId = dbState.id;
      }
    }
    
    // Cache org mappings for this state
    const stateMappings = await prisma.organisationMapping.findMany({
      where: { state: targetRegion }
    });
    const orgMap = new Map<string, string | null>();
    stateMappings.forEach(m => {
      if (m.isMapped && m.normalizedName) {
        orgMap.set(m.rawName, m.normalizedName);
      } else {
        orgMap.set(m.rawName, null);
      }
    });
    
    if (!regionDistrictId && target.type === 'DISTRICT') {
      const dbDistrict = await prisma.regionDistrict.findFirst({
        where: { name: { contains: targetRegion, mode: "insensitive" } }
      });
      if (dbDistrict) regionDistrictId = dbDistrict.id;
    }

    let allDistrictsForState: {id: string, name: string}[] = [];
    if (regionStateId) {
      allDistrictsForState = await prisma.regionDistrict.findMany({
        where: { stateId: regionStateId },
        select: { id: true, name: true }
      });
    }

    console.log(
      `[NICGEP] Fetching valid session for ${target.name} via SessionService...`
    );
    const cookieStr = await sessionService.getValidSessionCookie(baseUrl);

    if (!cookieStr) {
      console.warn(
        `[NICGEP] Warning: Could not obtain a valid session. Scraping may fail or be blocked by Captcha.`
      );
    }

    console.log(
      `[NICGEP] Fetching organisation tenders table for ${target.name}...`
    );
    const tenderRes = await axios.get(
      `${baseUrl}/nicgep/app?component=%24DirectLink&page=FrontEndTendersByOrganisation&service=direct&session=T&sp`,
      {
        headers: {
          "User-Agent": USER_AGENT,
          Cookie: cookieStr || "",
        },
      }
    );

    if (tenderRes.headers["set-cookie"]) {
      sessionService.updateCookiesFromHeaders(baseUrl, tenderRes.headers["set-cookie"]);
    } 
    const $ = cheerio.load(tenderRes.data);
    const rows = $("table#table tr.even, table#table tr.odd").toArray();

    if (rows.length === 0) {
      console.log(
        "[NICGEP] No rows found. Session might be invalid or table empty."
      );
      await prisma.scrapeLog.update({
        where: { id: scrapeLog.id },
        data: { status: "FAILED", error: "No rows found" }
      });
      return { district: targetRegion, success: false, tenders: [] };
    }

    console.log(`[NICGEP] Found ${rows.length} tenders. Processing...`);

    const limitCount = source === "TEST" ? 10 : rows.length;
    let retryCount = 0;
    let wasStopped = false;
    for (let i = 0; i < limitCount; i++) {
      let currentStatus = getStatus();
      if (currentStatus === "STOPPED") {
        console.log("[NICGEP] Scraper stopped.");
        wasStopped = true;
        break;
      }
      while (currentStatus === "PAUSED") {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        currentStatus = getStatus();
        if (currentStatus === "STOPPED") {
          wasStopped = true;
          break;
        }
      }
      if (wasStopped) break;

      const row = rows[i];
      const tds = $(row).find("td");
      if (tds.length < 6) continue;

      const publishedDateStr = $(tds[1]).text().trim();
      const closingDateStr = $(tds[2]).text().trim();
      const openingDateStr = $(tds[3]).text().trim();

      const titleCell = $(tds[4]);
      const fullTitle =
        titleCell.find("a.Xwb").text().trim() || titleCell.text().trim();
      const cleanTitle = fullTitle.replace(/[\n\t\r]+/g, " ").trim();
      const orgChain = $(tds[5]).text().trim();
      const orgName = orgChain || "State Tenders";

      let href = titleCell.find("a").attr("href");
      const detailUrl = href
        ? href.startsWith("http")
          ? href.replace(/&amp;/g, "&")
          : baseUrl + href.replace(/&amp;/g, "&")
        : `${baseUrl}/nicgep/app?page=FrontEndTendersByOrganisation&service=page` +
          "&fallback=" +
          i;

      // Extract NICGEP's own stable Tender ID from the title e.g. [2026_OSCSC_134676_1]
      const tenderIdMatch = cleanTitle.match(
        /\[([0-9]{4}_[A-Z0-9]+_[0-9]+_[0-9]+)\]/
      );
      const nicgepTenderId = tenderIdMatch
        ? tenderIdMatch[1]
        // Fallback: generate a stable hash from title + publishedDate
        : `hash_${Buffer.from(cleanTitle + publishedDateStr).toString('base64').substring(0, 24)}`;

      // Clean up the title by stripping trailing NICGEP brackets ([RefNo][TenderId])
      let displayTitle = cleanTitle;
      displayTitle = displayTitle.replace(/\[\s*[0-9]{4}_[A-Z0-9]+_[0-9]+_[0-9]+\s*\]/g, "").trim();
      while (true) {
        const match = displayTitle.match(/^(.*?)\[([^\]]+)\]$/);
        if (match) {
           const prefix = match[1].trim();
           if (prefix.length > 0) {
             displayTitle = prefix;
           } else {
             displayTitle = match[2].trim();
             break;
           }
        } else {
           break;
        }
      }

      if (i > 0 && i % 100 === 0) {
        console.log(`[NICGEP] Processed ${i}/${rows.length} tenders...`);
      }

      // Dedup check: look up by NICGEP tender ID (not a fake URL)
      const existing = await prisma.tender.findUnique({
        where: { tenderId: nicgepTenderId },
      });

      if (existing) {
        if (existing.documentsDownloaded) {
          if (onProgress) onProgress(1, 0);
          continue;
        }

        const now = new Date();
        if (existing.docDownloadStartDate && existing.docDownloadStartDate > now) {
          console.log(`[NICGEP] Tender ${existing.tenderCode || existing.id} download hasn't started yet. Skipping.`);
          if (onProgress) onProgress(1, 0);
          continue;
        }

        if (href) {
          console.log(`[NICGEP] Downloading missing documents for existing tender ${existing.id}...`);
          try {
            const success = await sessionService.downloadDocumentWithCaptcha(
              detailUrl,
              existing.tenderCode || existing.id,
              stateSlug,
              getStatus
            );
            if (success) {
              await prisma.tender.update({
                where: { id: existing.id },
                data: { documentsDownloaded: true }
              });
            }
          } catch (dlErr: any) {
            console.error(`[NICGEP] Document download failed for ${existing.id}:`, dlErr.message);
          }
        }
        if (onProgress) onProgress(1, 0);
        continue;
      }

      // ── Fetch Detail Page ──────────────────────────────────────────
      let detailData: Record<string, string> = {};
      let noticePdfUrl: string | null = null;
      let tenderPdfUrl: string | null = null;
      let onlineBankers: string | null = null;
      let coversInfo: string | null = null;

      if (href) {
        console.log(
          `[NICGEP] Fetching details for [${i + 1}/${rows.length}]: ${cleanTitle.substring(0, 50)}...`
        );

        try {
          const activeCookieStr = await sessionService.getValidSessionCookie(baseUrl);
          const detailRes = await axios.get(detailUrl, {
            headers: { "User-Agent": USER_AGENT, Cookie: activeCookieStr || "" },
          });
          if (detailRes.headers["set-cookie"]) {
            sessionService.updateCookiesFromHeaders(
              baseUrl,
              detailRes.headers["set-cookie"]
            );
          }
          const $d = cheerio.load(detailRes.data);

          // ── Collect all td_caption key→value pairs ──────────────────
          $d(".td_caption").each((_idx, el) => {
            const key = $d(el).text().replace(/\s+/g, " ").trim();
            const nextTd = $d(el).next("td");
            if (nextTd.length) {
              const val = nextTd.text().replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
              detailData[key] = val;
            }
          });

          // ── Fallback: Parse all 2 or 4 column property tables ──────────
          $d("table tr").each((_idx, tr) => {
            const tds = $d(tr).find("> td, > th");
            if (tds.length === 2 || tds.length === 4) {
              for (let i = 0; i < tds.length; i += 2) {
                const key = $d(tds[i]).text().replace(/\s+/g, " ").trim();
                const val = $d(tds[i + 1]).text().replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
                if (key && val && key.length < 50 && !detailData[key]) {
                  detailData[key] = val;
                }
              }
            }
          });

          // ── Extract document PDF links ──────────────────────────────
          $d("table a").each((_i, el) => {
            const linkHref = $d(el).attr("href") || "";
            const linkText = $d(el).text().toLowerCase();
            if (linkHref.includes("component=%24DirectLink")) {
              let fullLink = linkHref;
              if (!linkHref.startsWith("http")) {
                fullLink = linkHref.startsWith("/")
                  ? `${baseUrl}${linkHref}`
                  : `${baseUrl}/nicgep/${linkHref}`;
              }
              if (linkText.includes("tendernotice")) {
                noticePdfUrl = fullLink;
              } else if (linkText.includes("work_item")) {
                tenderPdfUrl = fullLink;
              }
            }
          });

          // ── Parse Online Bankers / Payment Instruments ──────────────
          const bankerNames: string[] = [];
          $d("table").each((_ti, tbl) => {
            const rows = $d(tbl).find("> tbody > tr, > thead > tr, > tr");
            if (rows.length > 0) {
              const firstRowCells = rows.first().find("> td, > th");
              if (firstRowCells.length >= 2) {
                const header2 = $d(firstRowCells[1]).text().trim();
                if (header2.includes("Bank Name")) {
                  rows.each((_ri, tr) => {
                    const tds = $d(tr).find("> td, > th");
                    if (tds.length >= 2) {
                      const first = $d(tds[0]).text().trim();
                      const second = $d(tds[1]).text().trim();
                      if (second && !second.includes("Bank Name") && /^\d+$/.test(first)) {
                        bankerNames.push(second);
                      }
                    }
                  });
                }
              }
            }
          });
          onlineBankers =
            bankerNames.length > 0 ? bankerNames.join(", ") : null;

          // ── Parse Covers Information ────────────────────────────────
          const covers: {
            coverNo: number;
            coverType: string;
            description: string;
            documentType: string;
          }[] = [];
          $d("table").each((_ti, tbl) => {
            const rows = $d(tbl).find("> tbody > tr, > thead > tr, > tr");
            if (rows.length > 0) {
              const firstRowCells = rows.first().find("> td, > th");
              if (firstRowCells.length >= 4) {
                const header1 = $d(firstRowCells[0]).text().trim();
                const header2 = $d(firstRowCells[1]).text().trim();
                if (header1.includes("Cover No") && header2.includes("Cover Type")) {
                  rows.each((_ri, tr) => {
                    const tds = $d(tr).find("> td, > th");
                    if (tds.length >= 4) {
                      const first = $d(tds[0]).text().trim();
                      const coverNo = parseInt(first, 10);
                      if (!isNaN(coverNo)) {
                        covers.push({
                          coverNo,
                          coverType: $d(tds[1]).text().trim(),
                          description: $d(tds[2]).text().trim(),
                          documentType: $d(tds[3]).text().trim(),
                        });
                      }
                    }
                  });
                }
              }
            }
          });
          coversInfo = covers.length > 0 ? JSON.stringify(covers) : null;

          await randomDelay(800, 1500);
        } catch (detailErr: any) {
          console.error(
            `[NICGEP] Failed to fetch detail page for ${cleanTitle}:`,
            detailErr.message
          );
          if (
            axios.isAxiosError(detailErr) &&
            detailErr.response?.status === 302
          ) {
            throw new Error("Session Expired during detail fetch");
          }
        }
      }

      // ── Map all extracted fields ─────────────────────────────────────
      const d = detailData;
      console.log(`[DEBUG NICGEP KEYS] Extracted keys for ${cleanTitle}:`, Object.keys(d));

      const findKeyByRegex = (regex: RegExp): string | undefined => {
        for (const k of Object.keys(d)) {
          if (regex.test(k)) return d[k];
        }
        return undefined;
      };

      // Extract Authority/District
      let rawOrgName = (norm(d["Organisation Chain"]) || targetRegion).split('||')[0].trim();
      let finalOrgName = rawOrgName;

      // Handle mapping logic
      if (orgMap.has(rawOrgName)) {
        const mappedName = orgMap.get(rawOrgName);
        if (mappedName) {
          finalOrgName = mappedName;
        } else {
          finalOrgName = toTitleCase(rawOrgName);
        }
      } else {
        // If not seen before, upsert to DB for admin to map later, and use raw (TitleCased) for now
        finalOrgName = toTitleCase(rawOrgName);
        try {
          await prisma.organisationMapping.upsert({
            where: { rawName: rawOrgName },
            update: {},
            create: {
              rawName: rawOrgName,
              state: targetRegion,
              isMapped: false
            }
          });
          orgMap.set(rawOrgName, null); // cache so we don't upsert again this run
        } catch (e) {
          console.error(`[NICGEP] Failed to auto-save unmapped org ${rawOrgName}:`, e);
        }
      }

      // Work description / main description
      const workDesc = norm(d["Work Description"]);
      const openingDesc = d["Bid Opening Date"]
        ? `Bid Opening: ${d["Bid Opening Date"]}`
        : `Opening Date: ${openingDateStr}`;
      const description =
        workDesc && workDesc !== "Please refer Tender documents."
          ? workDesc
          : `${openingDesc} | Published: ${publishedDateStr}`;

      // Dates
      const bidSubmissionStart = parseNicgepDate(d["Bid Submission Start Date"]);
      const bidSubmissionEnd = parseNicgepDate(d["Bid Submission End Date"]);

      const finalStartDate =
        bidSubmissionStart ||
        parseNicgepDate(openingDateStr) ||
        parseNicgepDate(publishedDateStr) ||
        new Date();
      const finalEndDate =
        bidSubmissionEnd || parseNicgepDate(closingDateStr) || new Date();

      const rawLocation = toTitleCase(norm(findKeyByRegex(/^Location/i)));
      const rawPincode = norm(findKeyByRegex(/^Pincode/i));
      const locationInfo = extractLocationInfo(rawLocation, allDistrictsForState, rawPincode);

      const tenderObj = {
        // Core
        district: finalOrgName,
        title: displayTitle,
        description,
        startDate: finalStartDate,
        endDate: finalEndDate,
        sourceUrl: detailUrl,       // real NICGEP URL (session-specific, reference only)
        noticePdfUrl: noticePdfUrl || null,
        tenderPdfUrl: tenderPdfUrl || null,

        // Financial
        emd: norm(findKeyByRegex(/EMD Amount/i)),
        tenderValue: norm(findKeyByRegex(/Tender Value/i)),
        tenderAmount: parseAmount(norm(findKeyByRegex(/Tender Value/i))),
        applicationCost: norm(findKeyByRegex(/Tender Fee/i)),

        // Location
        city: locationInfo.city,
        location: rawLocation,
        pincode: rawPincode,

        // Basic Details
        tenderId: norm(d["Tender ID"]) || (nicgepTenderId.startsWith("hash_") ? null : nicgepTenderId),
        tenderRefNumber: norm(d["Tender Reference Number"]),
        tenderType: norm(d["Tender Type"]),
        formOfContract: norm(d["Form Of Contract"]),
        tenderCategory: norm(d["Tender Category"]),
        noOfCovers: parseIntOrNull(d["No. of Covers"]),
        paymentMode: norm(d["Payment Mode"]),
        withdrawalAllowed: parseBoolean(d["Withdrawal Allowed"]),
        twoStageBidding: parseBoolean(d["Allow Two Stage Bidding"]),
        generalTechEvalAllowed: parseBoolean(d["General Technical Evaluation Allowed"]),
        itemWiseTechEvalAllowed: parseBoolean(d["ItemWise Technical Evaluation Allowed"]),
        multiCurrencyBOQ: parseBoolean(d["Is Multi Currency Allowed For BOQ"]),
        multiCurrencyFee: parseBoolean(d["Is Multi Currency Allowed For Fee"]),

        // Payment Instruments
        onlineBankers,

        // Covers
        coversInfo,

        // Work Item Details
        productCategory: norm(d["Product Category"]),
        subCategory: norm(d["Sub category"]),
        contractType: norm(d["Contract Type"]),
        bidValidityDays: parseIntOrNull(d["Bid Validity(Days)"]),
        periodOfWorkDays: parseIntOrNull(d["Period Of Work(Days)"]),
        bidOpeningPlace: norm(d["Bid Opening Place"]),
        preBidMeetingAddress: norm(d["Pre Bid Meeting Address"]),
        preBidMeetingDate: parseNicgepDate(d["Pre Bid Meeting Date"]),
        preBidMeetingPlace: norm(d["Pre Bid Meeting Place"]),
        ndaPreQualification: norm(d["NDA/Pre Qualification"]),
        allowNdaTender: parseBoolean(d["Should Allow NDA Tender"]),
        allowPreferentialBidder: parseBoolean(d["Allow Preferential Bidder"]),

        // Critical Dates
        publishedDate: parseNicgepDate(d["Published Date"]),
        docDownloadStartDate: parseNicgepDate(d["Document Download / Sale Start Date"]),
        docDownloadEndDate: parseNicgepDate(d["Document Download / Sale End Date"]),
        clarificationStartDate: parseNicgepDate(d["Clarification Start Date"]),
        clarificationEndDate: parseNicgepDate(d["Clarification End Date"]),
        bidOpeningDate: parseNicgepDate(d["Bid Opening Date"]),

        // Tender Fee Details
        vatCharges: norm(d["VAT Charges in \u20b9"]) || norm(d["VAT Charges in Rs."]) || norm(d["VAT Charges in ₹"]),
        feePayableTo: norm(d["Fee Payable To"]),
        feePayableAt: norm(d["Fee Payable At"]),
        feeExemptionAllowed: norm(d["Tender Fee Exemption Allowed"]),

        // EMD Fee Details
        emdExemptionAllowed: norm(d["EMD Exemption Allowed"]),
        emdFeeType: norm(d["EMD Fee Type"]),
        emdPercentage: norm(d["EMD Percentage"]),
        emdPayableTo: norm(d["EMD Payable To"]),
        emdPayableAt: norm(d["EMD Payable At"]),

        // Tender Inviting Authority
        invitingAuthorityName: norm(d["Name"]),
        invitingAuthorityAddress: norm(d["Address"]),
        invitingAuthorityDesignation: norm(d["Designation"]),
        organisationChain: norm(d["Organisation Chain"]),
      };

      let validData: any = null;
      const validation = TenderSchema.safeParse(tenderObj);
      if (validation.success) {
        validData = validation.data;
      } else {
        // Fallback: use today's date if date parsing failed
        try {
          const fallback = {
            ...tenderObj,
            startDate: tenderObj.startDate || new Date(),
            endDate: tenderObj.endDate || new Date(),
          };
          const fallbackValidation = TenderSchema.safeParse(fallback);
          if (fallbackValidation.success) validData = fallbackValidation.data;
        } catch (_e) {}
      }

      if (validData) {
        allValidTenders.push(validData);
        try {
          const savedTender = await prisma.tender.upsert({
            where: { tenderId: nicgepTenderId },  // deduplicate by NICGEP's own ID
            update: {
              // Update sourceUrl to latest real URL in case session changed
              sourceUrl: detailUrl,
              regionStateId: regionStateId,
              regionDistrictId: locationInfo.regionDistrictId || regionDistrictId,
              startDate: validData.startDate,
              endDate: validData.endDate,
              emd: validData.emd,
              tenderValue: validData.tenderValue,
              tenderAmount: validData.tenderAmount,
              applicationCost: validData.applicationCost,
              city: validData.city,
              district: locationInfo.district,
              location: validData.location,
              pincode: validData.pincode,
              tenderId: validData.tenderId,
              tenderRefNumber: validData.tenderRefNumber,
              tenderType: validData.tenderType,
              formOfContract: validData.formOfContract,
              tenderCategory: validData.tenderCategory,
              noOfCovers: validData.noOfCovers,
              paymentMode: validData.paymentMode,
              withdrawalAllowed: validData.withdrawalAllowed,
              twoStageBidding: validData.twoStageBidding,
              generalTechEvalAllowed: validData.generalTechEvalAllowed,
              itemWiseTechEvalAllowed: validData.itemWiseTechEvalAllowed,
              multiCurrencyBOQ: validData.multiCurrencyBOQ,
              multiCurrencyFee: validData.multiCurrencyFee,
              onlineBankers: validData.onlineBankers,
              coversInfo: validData.coversInfo,
              productCategory: validData.productCategory,
              subCategory: validData.subCategory,
              contractType: validData.contractType,
              bidValidityDays: validData.bidValidityDays,
              periodOfWorkDays: validData.periodOfWorkDays,
              bidOpeningPlace: validData.bidOpeningPlace,
              preBidMeetingAddress: validData.preBidMeetingAddress,
              preBidMeetingDate: validData.preBidMeetingDate,
              preBidMeetingPlace: validData.preBidMeetingPlace,
              ndaPreQualification: validData.ndaPreQualification,
              allowNdaTender: validData.allowNdaTender,
              allowPreferentialBidder: validData.allowPreferentialBidder,
              publishedDate: validData.publishedDate,
              docDownloadStartDate: validData.docDownloadStartDate,
              docDownloadEndDate: validData.docDownloadEndDate,
              clarificationStartDate: validData.clarificationStartDate,
              clarificationEndDate: validData.clarificationEndDate,
              bidOpeningDate: validData.bidOpeningDate,
              vatCharges: validData.vatCharges,
              feePayableTo: validData.feePayableTo,
              feePayableAt: validData.feePayableAt,
              feeExemptionAllowed: validData.feeExemptionAllowed,
              emdExemptionAllowed: validData.emdExemptionAllowed,
              emdFeeType: validData.emdFeeType,
              emdPercentage: validData.emdPercentage,
              emdPayableTo: validData.emdPayableTo,
              emdPayableAt: validData.emdPayableAt,
              invitingAuthorityName: validData.invitingAuthorityName,
              invitingAuthorityAddress: validData.invitingAuthorityAddress,
              invitingAuthorityDesignation: validData.invitingAuthorityDesignation,
              organisationChain: validData.organisationChain,
            },
            create: {
              state: targetRegion,
              regionStateId: regionStateId,
              regionDistrictId: locationInfo.regionDistrictId || regionDistrictId,
              level: "STATE",
              organisation: validData.district, // ValidData.district contains the orgName
              title: validData.title,
              description: validData.description,
              startDate: validData.startDate,
              endDate: validData.endDate,
              noticePdfUrl: noticePdfUrl || detailUrl,
              tenderPdfUrl: tenderPdfUrl || "",
              sourceUrl: detailUrl,

              // Financial
              emd: validData.emd,
              tenderValue: validData.tenderValue,
              applicationCost: validData.applicationCost,
              tenderAmount: validData.tenderAmount,

              // Location
              city: validData.city,
              district: locationInfo.district,
              location: validData.location,
              pincode: validData.pincode,

              // Basic Details
              tenderId: validData.tenderId,
              tenderRefNumber: validData.tenderRefNumber,
              tenderType: validData.tenderType,
              formOfContract: validData.formOfContract,
              tenderCategory: validData.tenderCategory,
              noOfCovers: validData.noOfCovers,
              paymentMode: validData.paymentMode,
              withdrawalAllowed: validData.withdrawalAllowed,
              twoStageBidding: validData.twoStageBidding,
              generalTechEvalAllowed: validData.generalTechEvalAllowed,
              itemWiseTechEvalAllowed: validData.itemWiseTechEvalAllowed,
              multiCurrencyBOQ: validData.multiCurrencyBOQ,
              multiCurrencyFee: validData.multiCurrencyFee,

              // Payment Instruments
              onlineBankers: validData.onlineBankers,

              // Covers
              coversInfo: validData.coversInfo,

              // Work Item Details
              productCategory: validData.productCategory,
              subCategory: validData.subCategory,
              contractType: validData.contractType,
              bidValidityDays: validData.bidValidityDays,
              periodOfWorkDays: validData.periodOfWorkDays,
              bidOpeningPlace: validData.bidOpeningPlace,
              preBidMeetingAddress: validData.preBidMeetingAddress,
              preBidMeetingDate: validData.preBidMeetingDate,
              preBidMeetingPlace: validData.preBidMeetingPlace,
              ndaPreQualification: validData.ndaPreQualification,
              allowNdaTender: validData.allowNdaTender,
              allowPreferentialBidder: validData.allowPreferentialBidder,

              // Critical Dates
              publishedDate: validData.publishedDate,
              docDownloadStartDate: validData.docDownloadStartDate,
              docDownloadEndDate: validData.docDownloadEndDate,
              clarificationStartDate: validData.clarificationStartDate,
              clarificationEndDate: validData.clarificationEndDate,
              bidOpeningDate: validData.bidOpeningDate,

              // Tender Fee
              vatCharges: validData.vatCharges,
              feePayableTo: validData.feePayableTo,
              feePayableAt: validData.feePayableAt,
              feeExemptionAllowed: validData.feeExemptionAllowed,

              // EMD Fee
              emdExemptionAllowed: validData.emdExemptionAllowed,
              emdFeeType: validData.emdFeeType,
              emdPercentage: validData.emdPercentage,
              emdPayableTo: validData.emdPayableTo,
              emdPayableAt: validData.emdPayableAt,

              // Inviting Authority
              invitingAuthorityName: validData.invitingAuthorityName,
              invitingAuthorityAddress: validData.invitingAuthorityAddress,
              invitingAuthorityDesignation: validData.invitingAuthorityDesignation,
              organisationChain: validData.organisationChain,
            },
          });

          // Assign tenderCode once on first insert (never overwrite an existing one)
          let finalTenderCode = savedTender.tenderCode;
          if (!finalTenderCode) {
            finalTenderCode = await generateTenderCode(prisma, targetRegion);
            await prisma.tender.update({
              where: { id: savedTender.id },
              data: { tenderCode: finalTenderCode },
            });
            console.log(`[NICGEP] Assigned code ${finalTenderCode} to tender ${savedTender.id}`);
          }

          // Download all documents (NIT PDFs + Work Item zip)
          if (href) {
            try {
              const success = await sessionService.downloadDocumentWithCaptcha(
                detailUrl,
                finalTenderCode || savedTender.id,
                stateSlug,
                getStatus
              );
              if (success) {
                await prisma.tender.update({
                  where: { id: savedTender.id },
                  data: { documentsDownloaded: true }
                });
              }
            } catch (dlErr: any) {
              console.error(`[NICGEP] Document download failed for ${savedTender.id}:`, dlErr.message);
            }
          }

          newTendersCount++;
          if (onProgress) onProgress(1, 1);
          retryCount = 0; // reset on success
        } catch (dbError: any) {
          console.error(`[DB Error NICGEP]`, dbError);
          const errMsg = String(dbError.message || dbError);
          // If ZodError or Session error occurs, it's likely an expired session page
          if (errMsg.includes("Session") || dbError.name === "ZodError" || Object.keys(detailData).length === 0) {
            retryCount++;
            if (retryCount <= 3) {
              console.log(`[NICGEP] Retrying tender ${i} (Attempt ${retryCount}/3). Refreshing session...`);
              await sessionService.getValidSessionCookie(baseUrl, true);
              i--; // Retry the current tender index
              continue;
            }
          }
          retryCount = 0; // Move to next tender if max retries exceeded
        }
      } else {
        if (onProgress && validData) onProgress(1, 0);
      }
    }

    console.log(
      `[NICGEP] Finished. Added/Updated ${newTendersCount} tenders.`
    );

    await prisma.scrapeLog.update({
      where: { id: scrapeLog.id },
      data: {
        status: wasStopped ? "STOPPED" : "SUCCESS",
        tendersFound: allValidTenders.length,
        newTendersAdded: newTendersCount,
      } as any,
    });

    return {
      district: targetRegion,
      success: !wasStopped,

      tenders: allValidTenders,
      newTendersCount,
    };
  } catch (error) {
    console.error(`[Scraper Error] Failed to scrape NICGEP State Tenders:`, error);

    await prisma.scrapeLog.update({
      where: { id: scrapeLog.id },
      data: {
        status: "FAILED",
        tendersFound: allValidTenders.length,
        newTendersAdded: newTendersCount,
        error: error instanceof Error ? error.message : "Unknown error",
      } as any,
    });

    return {
      district: targetRegion,
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      tenders: [],
      newTendersCount,
    };
  }
}
