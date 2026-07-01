import axios from "axios";
import { GoogleGenAI, Type, Schema } from "@google/genai";

export interface ExtractedTenderDetails {
  tenderValue: string | null;
  emd: string | null;
  applicationCost: string | null;
  bidOpeningDate?: string | null;
  aiSummary: string | null;
  tags: string[];
  rawText?: string | null;
}

function getApiKeys(): string[] {
  return [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY2,
    process.env.GEMINI_API_KEY3,
    process.env.GEMINI_API_KEY4,
  ].filter(Boolean) as string[];
}

let currentKeyIndex = 0;

function getNextApiKey(): string | null {
  const keys = getApiKeys();
  if (keys.length === 0) return null;
  return keys[currentKeyIndex % keys.length];
}

function rotateApiKey() {
  const keys = getApiKeys();
  if (keys.length > 1) {
    currentKeyIndex = (currentKeyIndex + 1) % keys.length;
    console.log(`[PDF Extractor] Rotated to API Key #${(currentKeyIndex % keys.length) + 1}`);
  }
}

export async function extractTenderDetailsFromPdf(pdfUrl: string): Promise<ExtractedTenderDetails | null> {
  let apiKey = getNextApiKey();
  if (!apiKey) {
    console.warn("[PDF Extractor] No GEMINI_API_KEY provided. Skipping extraction.");
    return null;
  }

  try {
    // 0. Check if URL is a PDF
    if (!pdfUrl.toLowerCase().split("?")[0].endsWith(".pdf")) {
      console.warn(`[PDF Extractor] URL is not a PDF: ${pdfUrl}. Skipping AI extraction.`);
      return {
        tenderValue: null,
        emd: null,
        applicationCost: null,
        aiSummary: "Non-PDF document attached. Please download to view.",
        tags: [],
        rawText: null,
      };
    }

    let ai = new GoogleGenAI({ apiKey });

    // 1. Download the PDF
    const response = await axios.get(pdfUrl, {
      responseType: "arraybuffer",
      timeout: 30000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/pdf",
      },
    });

    const buffer = Buffer.from(response.data);

    // 1.5 Extract Raw Text using pdf2json
    let rawTextFromPdf: string | null = null;
    try {
      const PDFParser = require("pdf2json");
      rawTextFromPdf = await Promise.race([
        new Promise<string>((resolve, reject) => {
          const pdfParser = new PDFParser(null, 1);
          pdfParser.on("pdfParser_dataError", (errData: any) => reject(errData.parserError));
          pdfParser.on("pdfParser_dataReady", () => resolve(pdfParser.getRawTextContent()));
          pdfParser.parseBuffer(buffer);
        }),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error("pdf2json timeout")), 10000)
        ),
      ]);
    } catch (e: any) {
      console.warn(`[PDF Extractor] Warning: Could not extract raw text: ${e.message || e}`);
    }

    // Convert the entire PDF buffer to base64 for Gemini
    const pdfBase64 = buffer.toString("base64");

    const responseSchema: Schema = {
      type: Type.OBJECT,
      properties: {
        tenderValue: { type: Type.STRING, description: "Estimated Cost/Value", nullable: true },
        emd: { type: Type.STRING, description: "Earnest Money Deposit", nullable: true },
        applicationCost: { type: Type.STRING, description: "Cost of Tender Paper", nullable: true },
        bidOpeningDate: {
          type: Type.STRING,
          description: "The exact date of bid opening/technical bid opening (e.g. 29-Jun-2026)",
          nullable: true,
        },
        aiSummary: { type: Type.STRING, description: "1-sentence summary", nullable: true },
        tags: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description:
            "List of relevant industry tags/keywords (e.g. Software, Infrastructure, Solar, Civil, Electrical, etc.) extracted from the document.",
        },
      },
    };

    const prompt = `
      You are an expert at extracting financial details and classifying Indian government tender notices.
      Please read the attached tender PDF document and find:
      1. Estimated Cost/Value of the tender
      2. EMD (Earnest Money Deposit)
      3. Cost of Tender Paper/Document Fee
      4. The exact date when the technical bid will be opened (bid opening date)
      5. A brief 1-sentence summary of the work
      6. Extract a list of relevant industry tags/keywords (e.g. Software, Hardware, Civil, Solar, Electrical)
      
      Note: The document may be a scanned image. Please read the tables carefully.
    `;

    let success = false;
    let parsedResult: ExtractedTenderDetails | null = null;
    let attempts = 0;
    const maxAttempts = getApiKeys().length;

    while (attempts < maxAttempts && !success) {
      try {
        const result = await ai.models.generateContent({
          model: "gemini-2.0-flash-lite",
          contents: [
            prompt,
            { inlineData: { mimeType: "application/pdf", data: pdfBase64 } },
          ],
          config: {
            responseMimeType: "application/json",
            responseSchema: responseSchema,
            temperature: 0.1,
          },
        });

        const responseText = result.text;
        if (responseText) {
          parsedResult = JSON.parse(responseText) as ExtractedTenderDetails;
          parsedResult.rawText = rawTextFromPdf;
          success = true;
          break;
        }
      } catch (aiError: any) {
        console.warn(
          `[PDF Extractor] Attempt ${attempts + 1} failed (Status: ${aiError?.status || aiError?.message}).`
        );

        if (aiError?.status === 429 || aiError?.status === 503) {
          rotateApiKey();
          apiKey = getNextApiKey()!;
          ai = new GoogleGenAI({ apiKey });
          attempts++;
        } else {
          break;
        }
      }
    }

    if (success && parsedResult) {
      return parsedResult;
    }

    console.warn(`[PDF Extractor] All AI models failed. Falling back to Regex...`);

    // REGEX FALLBACK MECHANISM
    try {
      const text = rawTextFromPdf;

      if (!text || text.trim().length === 0) {
        console.warn(`[PDF Extractor] Regex Fallback failed: PDF is a scanned image (no embedded text).`);
        return null;
      }

      const fallbackDetails: ExtractedTenderDetails = {
        tenderValue: null,
        emd: null,
        applicationCost: null,
        aiSummary: null,
        tags: [],
        rawText: text,
      };

      const upperText = text.toUpperCase();
      const commonTags = [
        "Software",
        "Hardware",
        "Civil",
        "Electrical",
        "Solar",
        "Infrastructure",
        "Vehicle",
        "Security",
        "Medical",
      ];
      for (const kw of commonTags) {
        if (upperText.includes(kw.toUpperCase())) {
          fallbackDetails.tags.push(kw);
        }
      }

      fallbackDetails.aiSummary = `[Auto-Fallback] Tender related to general sectors.`;

      const emdMatch = text.match(
        /(?:EMD|Earnest Money|Bid Security)[\s\S]{0,100}?(?:Rs\.?|₹|INR)[\s]*([\d,]+)/i
      );
      if (emdMatch) fallbackDetails.emd = `Rs. ${emdMatch[1]}`;

      const costMatch = text.match(
        /(?:Cost of Tender|Tender Fee|Paper Cost|Document Fee)[\s\S]{0,100}?(?:Rs\.?|₹|INR)[\s]*([\d,]+)/i
      );
      if (costMatch) fallbackDetails.applicationCost = `Rs. ${costMatch[1]}`;

      const valMatch = text.match(
        /(?:Estimated Cost|Tender Value|Amount)[\s\S]{0,100}?(?:Rs\.?|₹|INR)[\s]*([\d,]+(?:[\s]*(?:Lakhs?|Crores?))?)/i
      );
      if (valMatch) fallbackDetails.tenderValue = `Rs. ${valMatch[1]}`;

      console.log(`[PDF Extractor] Regex Fallback Successful!`);
      return fallbackDetails;
    } catch (regexError: any) {
      if (regexError?.code === "ENOENT") {
        console.warn(
          `[PDF Extractor] Regex Fallback failed: Malformed PDF or HTML error page received from government server.`
        );
      } else {
        console.error(`[PDF Extractor] Regex Fallback also crashed:`, regexError.message || regexError);
      }
      return null;
    }
  } catch (error) {
    console.error(`[PDF Extractor] Error processing ${pdfUrl}:`, error);
    return null;
  }
}

export async function extractTenderDetailsFromText(
  title: string,
  description: string
): Promise<ExtractedTenderDetails | null> {
  let apiKey = getNextApiKey();
  if (!apiKey) {
    return null;
  }

  try {
    let ai = new GoogleGenAI({ apiKey });

    const responseSchema: Schema = {
      type: Type.OBJECT,
      properties: {
        tenderValue: {
          type: Type.STRING,
          description: "Estimated Cost/Value if present, else null",
          nullable: true,
        },
        emd: { type: Type.STRING, description: "Earnest Money Deposit if present, else null", nullable: true },
        applicationCost: {
          type: Type.STRING,
          description: "Cost of Tender Paper if present, else null",
          nullable: true,
        },
        aiSummary: { type: Type.STRING, description: "A 1-sentence readable summary", nullable: true },
        tags: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description:
            "List of relevant industry tags/keywords (e.g. Software, Hardware, Civil, Solar, Electrical) inferred from the text.",
        },
      },
    };

    const prompt = `
      You are an expert at classifying Indian government tender notices.
      Please read the following tender title and description:
      Title: ${title}
      Description: ${description}
      
      Extract any financial details if present, and provide a 1-sentence summary and industry tags.
    `;

    let success = false;
    let parsedResult: ExtractedTenderDetails | null = null;
    let attempts = 0;
    const maxAttempts = getApiKeys().length;

    while (attempts < maxAttempts && !success) {
      try {
        const result = await ai.models.generateContent({
          model: "gemini-2.0-flash-lite",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: responseSchema,
          },
        });

        const responseText = result.text;
        if (responseText) {
          parsedResult = JSON.parse(responseText) as ExtractedTenderDetails;
          parsedResult.rawText = `${title}\n${description}`;
          success = true;
          break;
        }
      } catch (aiError: any) {
        console.warn(
          `[Text Extractor] Attempt ${attempts + 1} failed (Status: ${aiError?.status || aiError?.message}).`
        );

        if (aiError?.status === 429 || aiError?.status === 503) {
          rotateApiKey();
          apiKey = getNextApiKey()!;
          ai = new GoogleGenAI({ apiKey });
          attempts++;
        } else {
          throw aiError;
        }
      }
    }

    if (success && parsedResult) {
      return parsedResult;
    }
    return null;
  } catch (error) {
    console.error("[Text Extractor] Error:", error);
    throw error;
  }
}
