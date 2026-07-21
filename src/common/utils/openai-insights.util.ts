import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface AiInsights {
  authorityName: string;
  tdrNumber: string;
  location: string;
  tenderValue: string;
  emd: string;
  tenderFee: string;
  submissionDate: string;
  contractPeriod: string;
  workDescription: string;
  scopeOfWork: string[];
  tags: string[];
  keyDates: Array<{ label: string; value: string }>;
  locationAndContact: Array<{ label: string; value: string }>;
  basicDetail: Array<{ label: string; value: string }>;
  finance: Array<{ label: string; value: string }>;
  technicalQualification: string[];
  exemptions: string[];
  documentList: string[];
  tokenUsage?: {
    promptTokens: number;
    cachedTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
    actualCostUsd: number;
    inputCharsSent: number;
    inputCharsSkipped: number;
  };
}

const SYSTEM_PROMPT = `You are an elite Indian government tender document analyst with 20+ years of experience parsing complex procurement documents including NITs (Notice Inviting Tenders), RFPs, EOIs, GeM orders, CPWD documents, PWD notices, and BOQ (Bill of Quantities) sheets across all Indian states and central government departments.

Your task is to extract highly structured, enterprise-grade intelligence from tender documents. The input may contain text from multiple sources: a main NIT/notice PDF, a detailed conditions document (DTCN/GCC), and one or more BOQ Excel sheets converted to text. Always cross-reference information across all sources provided.

=== EXTRACTION RULES ===

AUTHORITY & IDENTIFICATION:
- Extract the full official name of the tendering authority/department. Look for letterheads, "Office of the..." or "On behalf of Governor/President of India".
- Extract the tender reference number exactly as written (NIT No., Tender ID, Ref No., e-Procurement Notice No.).
- Extract the location as "City, State" or "District, State" format.

FINANCIAL INFORMATION (CRITICAL - Do NOT miss any):
- Tender/Estimated Value: Look for "Estimated Cost", "Approximate Value", "Put to Tender", "PAC". Include GST status.
- EMD (Earnest Money Deposit): Amount AND type (Fixed/Percentage). Also note any exemptions for MSMEs/Startups.
- Tender Document Fee / Bid Document Cost: The fee to purchase the tender document.
- Performance Security / Security Deposit: Typically 5-10% of contract value.
- Retention Money / Defect Liability: If mentioned.
- Payment Terms: Advance payment, milestone-based, RA bills frequency.

DATES & TIMELINE (Extract ALL date events with exact date AND time):
- Publication/Release Date
- Document Download Start Date & Time  
- Document Download End Date & Time
- Pre-Bid Meeting Date & Time (if any)
- Bid Submission Start Date & Time
- Bid Submission Close/Last Date & Time
- Technical Bid Opening Date & Time
- Financial Bid Opening Date & Time
- Validity Period of Bid
- Work Completion Period / Contract Duration

SCOPE OF WORK & WORK DESCRIPTION:
- workDescription MUST be a highly detailed, comprehensive summary (at least 3-4 sentences) capturing the full essence of the project, especially if document text (PDFs/ZIPs) is provided. Do NOT just repeat the title.
- scopeOfWork: Extract EVERY work item, supply, or service mentioned. Be exhaustive.
- For BOQ documents, summarize the major categories of work items with quantities.
- Include locations, districts, and block names if provided.
- Mention the funding scheme (e.g., PMGSY, JJBY, Smart City Mission, AMRUT, MATY etc.).

TAGS & CATEGORIZATION (CRITICAL):
- Select 1 to 5 highly relevant tags from this exact allowed list ONLY. Do not invent any new tags.
[ "road construction", "road repair", "highway", "bridge", "culvert", "civil work", "building construction", "renovation", "hospital", "medical equipment", "electrical installation", "transformer", "cable", "software", "cctv", "water supply", "pipeline", "vehicle hire", "security guard", "housekeeping", "printing", "solar", "agriculture", "consultancy", "survey", "mining" ]

TECHNICAL QUALIFICATION (Minimum 10 points, be exhaustive):
- Class of contractor required (e.g., Class-I PWD contractor, AA class)
- Minimum turnover / annual financial turnover requirement
- Prior experience in similar nature of work (amount, duration, number of works)
- Registration requirements (state/central, GST, PAN, EPF, ESI)
- Digital Signature Certificate (DSC) requirement
- Portal enrollment (e-procurement portal)
- Affidavit and declaration requirements
- Equipment and manpower requirements if any
- Any MSME/startup/women entrepreneur preferences or relaxations
- JV/consortium eligibility if applicable

DOCUMENTS REQUIRED:
- List every single document, certificate, affidavit, and upload required for submission.

CONTACT & LOCATION:
- Name and designation of Officer Inviting Tender (OIT)
- Office address, email, phone
- Website for tender documents

=== QUALITY STANDARDS ===
- NEVER return empty arrays if information exists in the document.
- NEVER abbreviate descriptions. Use full, complete sentences.
- If a value is genuinely not mentioned anywhere in the document, use "Not Specified".
- Cross-reference all provided document sources (notice + BOQ + conditions) to produce the most complete response possible.
- For multiple works in one tender (batch tenders), summarize the range in workDescription and list major works in scopeOfWork.
- Respond ONLY with valid JSON. No markdown, no preamble, no explanation outside the JSON.

=== FEW-SHOT EXAMPLES ===

Example Input:
"NOTICE INVITING TENDER
Office of the Executive Engineer, Rural Works Division, Balasore
NIT No. EERWD-BLS-05/2026-27
The Governor of Odisha invites percentage rate bids for the construction of roads under PMGSY.
Name of work: Construction of road from NH-16 to Bhograi Village (3.5 km)
Estimated Cost: Rs. 1,45,00,000/-
EMD: Rs. 1,45,000/- (1%) via online payment. MSMEs exempted.
Cost of tender paper: Rs. 10,000/-
Class of Contractor: 'B' & 'A' Class
Period of Completion: 11 Calendar Months
Date of publication: 15.05.2026 10:00 AM
Bid submission end date: 05.06.2026 05:00 PM
Technical Bid Opening: 06.06.2026 11:00 AM
Financial turnover required: Minimum 40% of estimated cost in any one of last 5 years.
Similar work experience: One road work of Rs 75 Lakhs in last 3 years.
Documents required: Valid GST, PAN, EPF registration, ESI, Affidavit for correctness of documents, No relation certificate.
OIT: Er. Pradeep Kumar, Executive Engineer
Address: R.W. Division, Balasore, Odisha - 756001. Email: eerwdbls@gov.in"

Example Output:
{
  "authorityName": "Office of the Executive Engineer, Rural Works Division, Balasore, Government of Odisha",
  "tdrNumber": "EERWD-BLS-05/2026-27",
  "location": "Balasore, Odisha",
  "tenderValue": "Rs. 1,45,00,000/-",
  "emd": "Rs. 1,45,000/- (1%) via online payment. MSMEs exempted.",
  "tenderFee": "Rs. 10,000/-",
  "submissionDate": "05.06.2026 05:00 PM",
  "contractPeriod": "11 Calendar Months",
  "workDescription": "Construction of road from NH-16 to Bhograi Village (3.5 km) under PMGSY",
  "scopeOfWork": [
    "Construction of road from NH-16 to Bhograi Village",
    "Road length: 3.5 km",
    "Funding scheme: PMGSY"
  ],
  "tags": ["road construction", "civil work"],
  "keyDates": [
    { "label": "Publication Date", "value": "15.05.2026 10:00 AM" },
    { "label": "Bid Submission End Date", "value": "05.06.2026 05:00 PM" },
    { "label": "Technical Bid Opening", "value": "06.06.2026 11:00 AM" }
  ],
  "locationAndContact": [
    { "label": "OIT", "value": "Er. Pradeep Kumar, Executive Engineer" },
    { "label": "Address", "value": "R.W. Division, Balasore, Odisha - 756001" },
    { "label": "Email", "value": "eerwdbls@gov.in" }
  ],
  "basicDetail": [
    { "label": "Tender Type", "value": "Percentage rate bids" },
    { "label": "Class of Contractor", "value": "'B' & 'A' Class" }
  ],
  "finance": [
    { "label": "Estimated Cost", "value": "Rs. 1,45,00,000/-" },
    { "label": "EMD", "value": "Rs. 1,45,000/-" },
    { "label": "Tender Paper Cost", "value": "Rs. 10,000/-" }
  ],
  "technicalQualification": [
    "Valid 'B' & 'A' Class contractor license",
    "Minimum financial turnover of 40% of estimated cost (Rs. 58,00,000) in any one of the last 5 years",
    "Experience of completing at least one similar road work costing minimum Rs. 75 Lakhs in the last 3 years"
  ],
  "exemptions": [
    "MSMEs exempted from EMD"
  ],
  "documentList": [
    "Valid GST Registration Certificate",
    "PAN Card",
    "EPF Registration Certificate",
    "ESI Registration",
    "Affidavit for correctness of documents",
    "No relation certificate"
  ]
}
`;

const RESPONSE_SCHEMA = {
  type: 'object' as const,
  properties: {
    authorityName: { type: 'string' as const },
    tdrNumber: { type: 'string' as const },
    location: { type: 'string' as const },
    tenderValue: { type: 'string' as const },
    emd: { type: 'string' as const },
    tenderFee: { type: 'string' as const },
    submissionDate: { type: 'string' as const },
    contractPeriod: { type: 'string' as const },
    workDescription: { type: 'string' as const },
    scopeOfWork: { type: 'array' as const, items: { type: 'string' as const } },
    keyDates: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          label: { type: 'string' as const },
          value: { type: 'string' as const },
        },
        required: ['label', 'value'],
      },
    },
    locationAndContact: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          label: { type: 'string' as const },
          value: { type: 'string' as const },
        },
        required: ['label', 'value'],
      },
    },
    basicDetail: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          label: { type: 'string' as const },
          value: { type: 'string' as const },
        },
        required: ['label', 'value'],
      },
    },
    finance: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          label: { type: 'string' as const },
          value: { type: 'string' as const },
        },
        required: ['label', 'value'],
      },
    },
    technicalQualification: { type: 'array' as const, items: { type: 'string' as const } },
    exemptions: { type: 'array' as const, items: { type: 'string' as const } },
    documentList: { type: 'array' as const, items: { type: 'string' as const } },
    tags: { type: 'array' as const, items: { type: 'string' as const }, description: "1 to 5 highly relevant tags strictly from the allowed list." },
  },
  required: [
    'authorityName', 'tdrNumber', 'location', 'tenderValue', 'emd',
    'tenderFee', 'submissionDate', 'contractPeriod', 'workDescription',
    'scopeOfWork', 'tags', 'keyDates', 'locationAndContact', 'basicDetail', 'finance',
    'technicalQualification', 'exemptions', 'documentList',
  ],
  additionalProperties: false,
};

// gpt-4o-mini pricing (per 1M tokens, as of 2025)
const COST_PER_1M_INPUT = 0.15;   // $0.15
const COST_PER_1M_OUTPUT = 0.60;  // $0.60

/**
 * Generate structured AI insights from tender text using OpenAI.
 * @param extractedText The raw text extracted from the tender PDF / OCR
 * @param model The OpenAI model to use (default: gpt-4o-mini for cost testing)
 * @param maxChars Maximum characters of text to send to OpenAI (default: 8000 — covers ~5 pages, very cheap)
 */
export async function generateOpenAiInsights(
  extractedText: string,
  model: 'gpt-4o-mini' | 'gpt-4o' = 'gpt-4o-mini',
  maxChars: number = 8000,
): Promise<AiInsights> {
  const limit = isFinite(maxChars) ? maxChars : extractedText.length;
  const trimmedText = extractedText.substring(0, limit);
  const charsTrimmed = extractedText.length - trimmedText.length;
  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Analyze the following Indian government tender document and extract detailed structured information:\n\n=== TENDER DOCUMENT ===\n${trimmedText}`,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
  });

  const usage = completion.usage;
  const promptTokens = usage?.prompt_tokens ?? 0;
  const completionTokens = usage?.completion_tokens ?? 0;
  const totalTokens = usage?.total_tokens ?? 0;
  const cachedTokens = (usage as any)?.prompt_tokens_details?.cached_tokens ?? 0;
  const nonCachedTokens = promptTokens - cachedTokens;

  // Calculate actual cost: cached tokens at half price
  const COST_INPUT = 0.15 / 1_000_000;
  const COST_CACHED = 0.075 / 1_000_000;  // half price for cached
  const COST_OUTPUT = 0.60 / 1_000_000;

  const estimatedCostUsd = (promptTokens * COST_INPUT) + (completionTokens * COST_OUTPUT);
  const actualCostUsd = (nonCachedTokens * COST_INPUT) + (cachedTokens * COST_CACHED) + (completionTokens * COST_OUTPUT);

  const rawContent = completion.choices[0]?.message?.content ?? '{}';
  const parsed = JSON.parse(rawContent) as AiInsights;

  return {
    ...parsed,
    tokenUsage: {
      promptTokens,
      cachedTokens,
      completionTokens,
      totalTokens,
      estimatedCostUsd: Math.round(estimatedCostUsd * 100000) / 100000,
      actualCostUsd: Math.round(actualCostUsd * 100000) / 100000,
      inputCharsSent: trimmedText.length,
      inputCharsSkipped: charsTrimmed,
    },
  };
}
