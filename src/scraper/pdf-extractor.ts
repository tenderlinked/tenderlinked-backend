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

import * as fs from 'fs';

export async function extractTenderDetailsFromPdf(localPdfPath: string): Promise<ExtractedTenderDetails | null> {
  let apiKey = getNextApiKey();
  if (!apiKey) {
    console.warn("[PDF Extractor] No GEMINI_API_KEY provided. Skipping extraction.");
    return null;
  }

  try {
    // 0. Check if it's a pdf extension string
    if (!localPdfPath.toLowerCase().split("?")[0].endsWith(".pdf")) {
      console.warn(`[PDF Extractor] Not a PDF: ${localPdfPath}. Skipping AI extraction.`);
      return {
        tenderValue: null,
        emd: null,
        applicationCost: null,
        aiSummary: "Non-PDF document attached. Please view online.",
        tags: [],
        rawText: null,
      };
    }

    // 1. Read the PDF from local disk
    if (!fs.existsSync(localPdfPath)) {
      console.warn(`[PDF Extractor] Local file not found: ${localPdfPath}. Skipping AI extraction.`);
      return null;
    }
    
    const buffer = fs.readFileSync(localPdfPath);



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
        aiSummary: { type: Type.STRING, description: "A detailed scope of work containing minimum 10 bullet points, each separated by a newline character. Be as detailed as possible.", nullable: true },
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
      5. A detailed Scope of Work. You must provide a minimum of 10 distinct points outlining the work description, specifications, and responsibilities. Format as a single string with each point separated by a newline.
      6. Extract a list of relevant industry tags/keywords (e.g. Software, Hardware, Civil, Solar, Electrical)
      
      Note: The document may be a scanned image. Please read the tables carefully.
    `;

    let success = false;
    let parsedResult: ExtractedTenderDetails | null = null;
    let attempts = 0;
    const maxAttempts = getApiKeys().length;

    while (attempts < maxAttempts && !success) {
      try {
        let currentAi = new GoogleGenAI({ apiKey: getNextApiKey() as string });
        const result = await currentAi.models.generateContent({
          model: "gemini-3.1-flash-lite",
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
    console.error(`[PDF Extractor] Error processing ${localPdfPath}:`, error);
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
        let currentAi = new GoogleGenAI({ apiKey: getNextApiKey() as string });

        const result = await currentAi.models.generateContent({
          model: "gemini-3.1-flash-lite",
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

export async function generateFullAiSummary(
  pdfBuffer: Buffer,
  rawText: string | null,
  mode: 'vision' | 'text'
): Promise<any> {
  let apiKey = getNextApiKey();
  if (!apiKey) throw new Error("No Gemini API key available");

  const responseSchema: Schema = {
    type: Type.OBJECT,
    properties: {
      authorityName: { type: Type.STRING, description: "Name of the organizing authority" },
      tdrNumber: { type: Type.STRING, description: "Tender number or reference ID" },
      location: { type: Type.STRING, description: "City and state" },
      tenderValue: { type: Type.STRING },
      emd: { type: Type.STRING },
      tenderFee: { type: Type.STRING },
      submissionDate: { type: Type.STRING },
      contractPeriod: { type: Type.STRING },
      workDescription: { type: Type.STRING, description: "Highly detailed and comprehensive description of the entire work to be done. Include all major components and background context." },
      scopeOfWork: { 
        type: Type.ARRAY, 
        items: { type: Type.STRING },
        description: "Exhaustive, fully-detailed, itemized list of every single work item, supply, or service mentioned in the scope. Do not omit any technical specifications or components."
      },
      keyDates: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            label: { type: Type.STRING },
            value: { type: Type.STRING }
          }
        },
        description: "MUST include ALL of these date events if present in the document: Publication/Release Date, Document Download Start, Document Download End, Bid Submission Start, Bid Submission End/Close, Bid Opening Date, Pre-Bid Meeting, Corrigendum Date, Work Order Date. Extract the exact date and time values."
      },
      locationAndContact: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            label: { type: Type.STRING },
            value: { type: Type.STRING }
          }
        }
      },
      basicDetail: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            label: { type: Type.STRING },
            value: { type: Type.STRING }
          }
        }
      },
      finance: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            label: { type: Type.STRING },
            value: { type: Type.STRING }
          }
        },
        description: "MUST include these rows as separate entries if found: Tender/Estimated Value, EMD Amount, EMD Details/Type (Fixed/Percentage), EMD Exemption Criteria, Tender Document Fee, Payment Mode, GST/Tax Info, Performance Security, Retention Money, Payment Terms. Always extract all financial values with their exact amounts and percentages."
      },
      technicalQualification: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "MINIMUM 10 points required. Extract every single eligibility criterion, technical requirement, past-experience clause, turnover condition, registration requirement, certification, manpower requirement, equipment requirement, and financial capacity from the entire document. Each requirement should be a separate, self-contained, fully-detailed string. Do not merge multiple requirements into one point."
      },
      exemptions: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "All exemptions, relaxations for MSME/Startups, or special clauses."
      },
      documentList: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "Exhaustive list of every single document, affidavit, and certificate required to be submitted."
      }
    },
    required: [
      "authorityName", "tdrNumber", "location", "tenderValue", "emd", 
      "tenderFee", "submissionDate", "contractPeriod", "workDescription", "scopeOfWork",
      "keyDates", "locationAndContact", "basicDetail", "finance", 
      "technicalQualification", "exemptions", "documentList"
    ]
  };

  const prompt = `
    You are an expert at analyzing complex Indian government tender documents.
    Extract the required information to populate a highly detailed, enterprise-grade summary report.
    
    CRITICAL INSTRUCTIONS:
    1. Do NOT abbreviate or summarize too briefly. The user requires FULL DETAILS.
    2. For "Work Description" and "Scope of Work", extract long, comprehensive descriptions including all technical specifications, locations, and components mentioned.
    3. For "Technical Qualification" and "Document List", extract EVERY SINGLE requirement exhaustively. Do not miss any bullet points or sub-clauses from the original PDF. You MUST provide at least 10 technical qualification points.
    4. For "Finance", ALWAYS include separate rows for: Tender Value, EMD Amount, EMD Details, Tender Fee, Payment Terms, Performance Security. Extract exact numbers.
    5. For "Key Dates", ALWAYS include separate rows for every date event found: Publication Date, Document Download Start/End, Bid Submission Start/End, Bid Opening. Extract exact date AND time.
    6. Format your response EXACTLY matching the provided JSON schema.
    7. If a specific piece of information is entirely missing from the document, provide "Not Specified".
  `;

  let attempts = 0;
  const maxAttempts = getApiKeys().length;

  while (attempts < maxAttempts) {
    try {
      let currentAi = new GoogleGenAI({ apiKey: getNextApiKey() as string });

      let contents: any;
      if (mode === 'vision') {
        contents = [
          prompt,
          { inlineData: { mimeType: "application/pdf", data: pdfBuffer.toString('base64') } }
        ];
      } else {
        // text mode
        contents = `${prompt}\n\n=== DOCUMENT TEXT ===\n${rawText || 'No text extracted'}`;
      }

      const result = await currentAi.models.generateContent({
        model: "gemini-3.1-flash-lite",
        contents: contents,
        config: {
          responseMimeType: "application/json",
          responseSchema: responseSchema,
          temperature: 0.1,
        },
      });

      if (result.text) {
        return JSON.parse(result.text);
      }
      throw new Error("Empty response from Gemini");
    } catch (aiError: any) {
      console.warn(`[AI Summary Extractor] Attempt ${attempts + 1} failed (Status: ${aiError?.status || aiError?.message}).`);
      if (aiError?.status === 429 || aiError?.status === 503 || aiError?.status === 400) {
        rotateApiKey();
        attempts++;
      } else {
        throw aiError;
      }
    }
  }
  
  throw new Error("All AI models failed to generate the summary.");
}
