import * as natural from 'natural';

// ---------------------------------------------------------------------------
// STEMMER SETUP
// We use the Porter Stemmer — fully local, no API needed.
// Stems words to their root: "constructions" → "construct", "repairing" → "repair"
// ---------------------------------------------------------------------------
const stemmer = natural.PorterStemmer;

/** Stem a whole phrase, word by word */
function stemPhrase(phrase: string): string {
  return phrase
    .toLowerCase()
    .split(/\s+/)
    .map(w => stemmer.stem(w))
    .join(' ');
}

/** Return a word-boundary regex for a phrase (handles multi-word phrases too) */
function wordBoundaryRegex(phrase: string, flags = 'gi'): RegExp {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // For multi-word phrases, use \b on the outer edges only
  return new RegExp(`(?<![\\w])${escaped}(?![\\w])`, flags);
}

// ---------------------------------------------------------------------------
// CATEGORY DICTIONARY
// Keywords sorted longest-first within each category so multi-word phrases
// are evaluated and scored before shorter sub-words.
// ---------------------------------------------------------------------------
export const CATEGORY_DICTIONARY: Record<string, string[]> = {
  "Roads & Highways": [
    "road construction", "road repair", "road maintenance", "highway construction",
    "road widening", "road development", "road improvement",
    "highway", "nhai", "morth", "asphalt", "bitumen", "pothole", "pavement",
    "bridge construction", "culvert construction", "bridge", "culvert",
    "road", "flyover"
  ],
  "Civil Works": [
    "sub centre building", "day care centre", "primary health centre",
    "community health centre", "anganwadi building", "government building",
    "civil work", "building construction", "building renovation",
    "earthwork", "concrete", "cement", "masonry", "plumbing",
    "construction", "renovation", "demolition", "structural", "architect",
    "building"
  ],
  "Medical & Hospital": [
    "day care centre", "health care", "medical equipment", "primary health",
    "community health", "sub health centre", "sub centre", "anm",
    "ambulance", "surgical equipment", "hospital management",
    "medicine", "surgical", "hospital", "x-ray", "mri", "drugs", "pharmacy",
    "clinic", "healthcare", "pharma", "medical"
  ],
  "Electrical": [
    "ht/lt", "electrical installation", "electrical work", "street light",
    "transformer", "switchgear", "substation", "power distribution",
    "cable", "wiring", "transmission", "generator", "dg set", "illumination",
    "led", "electrical"
  ],
  "IT & Software": [
    "it infrastructure", "software development", "data center", "computer hardware",
    "software", "hardware", "server", "laptop", "networking",
    "cctv", "computer", "website", "application", "lan", "wan",
    "cloud", "printer"
  ],
  "Water & Sanitation": [
    "water supply", "water treatment", "sewage treatment", "drainage system",
    "overhead tank", "ground water", "jal jeevan mission", "jal jeevan",
    "stp", "wtp", "borewell", "irrigation", "pipeline",
    "pump", "sewage", "drainage", "sanitation", "dam", "canal"
  ],
  "Vehicles & Transport": [
    "hiring of vehicle", "vehicle hire", "vehicle purchase", "bus hire",
    "truck hire", "ambulance purchase", "fleet management",
    "vehicle", "bus", "truck", "transport", "fleet", "logistics", "tyres",
    "automobile"
  ],
  "Security Services": [
    "security guard", "manpower supply", "security services",
    "fire alarm", "fire extinguisher", "access control",
    "cctv", "surveillance", "watchman", "bouncers"
  ],
  "Catering & Housekeeping": [
    "mid day meal", "food supply", "dietary services",
    "pest control", "housekeeping services",
    "catering", "food", "canteen", "housekeeping", "cleaning", "sweeping",
    "laundry", "dietary"
  ],
  "Printing & Stationery": [
    "printing work", "office stationery",
    "printing", "stationery", "paper", "xerox", "binding",
    "books", "toner", "cartridge", "flex", "hoarding"
  ],
  "Solar & Renewable Energy": [
    "solar power plant", "solar street light", "solar pump",
    "solar", "photovoltaic", "pv module", "renewable", "wind energy", "biogas"
  ],
  "Agriculture & Forestry": [
    "agriculture department", "seeds supply", "fertilizer supply",
    "agriculture", "seeds", "fertilizer", "pesticides", "tractor",
    "forestry", "plantation", "horticulture", "saplings", "nursery"
  ],
  "Mining & Minerals": [
    "mining", "coal", "iron ore", "minerals", "drilling", "blasting",
    "quarry", "excavation", "sand"
  ],
  "Consultancy & Professional Services": [
    "project management consultancy", "architectural consultancy", "chartered accountant",
    "consultancy", "audit", "survey", "project management", "pmc", "legal", "valuation"
  ],
  "Event Management": [
    "event management", "sound system",
    "event", "tent", "exhibition", "shamiana", "decoration",
    "stage", "photography", "videography", "banquet"
  ],
  "Textiles & Garments": [
    "uniform supply", "bedsheet supply",
    "uniform", "stitching", "cloth", "garments", "textile",
    "blanket", "bedsheet", "shoes", "canvas"
  ],
  "Furniture & Fixtures": [
    "furniture supply", "office furniture", "modular furniture",
    "furniture", "chair", "table", "almirah", "rack",
    "desk", "sofa", "interior"
  ],
  "Machinery & Equipment": [
    "annual maintenance contract", "operation and maintenance",
    "machinery", "equipment", "compressor", "boiler", "cnc",
    "lathe", "welding", "crane", "forklift", "spares", "lubricants"
  ],
  "Aviation & Aerospace": [
    "aviation", "aircraft", "helicopter", "airport", "runway",
    "aeronautical", "uav", "drone"
  ],
  "Marine & Shipping": [
    "marine", "ship", "boat", "vessel", "port", "dredging",
    "cargo", "freight", "navy"
  ],
  "Sports & Recreation": [
    "sports complex", "playground development", "swimming pool",
    "sports", "stadium", "gymnasium", "playground",
    "athletic", "turf", "fitness"
  ],
  "Railways & Metro": [
    "overhead equipment", "railway track", "metro station", "rail track",
    "railway", "rail", "track", "coach", "wagon", "locomotive",
    "signaling", "signal", "ohe", "rdso", "ircon", "railtel", "metro", "station", "platform"
  ],
  "Telecom & Communication": [
    "optical fiber cable", "optical fiber", "broadband internet",
    "telecom", "fiber", "ofc", "broadband", "internet", "gsm",
    "4g", "5g", "tower", "bts", "epabx", "voip", "wireless",
    "communication", "router", "switch"
  ],
  "Oil & Gas": [
    "petroleum pipeline", "gas pipeline", "lpg pipeline",
    "oil", "gas", "petroleum", "diesel", "lpg", "png",
    "refinery", "pipeline", "compressor", "fuel", "iocl", "hpcl",
    "bpcl", "ongc", "gail", "terminal"
  ],
  "Power Generation": [
    "power plant", "thermal power", "hydro power", "cooling tower",
    "coal handling", "ash handling",
    "thermal", "hydro", "turbine", "boiler",
    "generator", "powerhouse", "steam"
  ],
  "Education": [
    "smart classroom", "school building", "college hostel",
    "school", "college", "university", "classroom",
    "smart class", "laboratory", "library", "hostel",
    "education", "teaching", "training institute"
  ],
  "Laboratory & Scientific": [
    "laboratory equipment", "scientific equipment",
    "laboratory", "lab", "scientific", "reagent", "chemical",
    "testing", "calibration", "pathology", "microscope",
    "spectrometer", "nabl"
  ],
  "Fire Safety": [
    "fire fighting system", "fire suppression", "fire alarm system",
    "firefighting", "hydrant", "sprinkler", "smoke detector",
    "fire pump", "fire extinguisher"
  ],
  "Waste Management": [
    "solid waste management", "biomedical waste", "waste processing",
    "door to door collection", "municipal waste",
    "garbage", "waste collection", "landfill", "compost"
  ],
  "HVAC": [
    "air conditioning", "central air conditioning",
    "hvac", "air conditioner", "ventilation", "chiller",
    "cooling tower", "ahu", "duct", "vrf", "vrv", "exhaust fan"
  ],
  "Industrial Supplies": [
    "bearing", "valve", "pipe", "flange", "industrial gas",
    "fastener", "tool", "consumables"
  ],
  "Chemicals": [
    "industrial chemical", "laboratory chemical",
    "chemical", "acid", "alkali", "solvent", "gas cylinder", "lubricant"
  ],
  "Banking & Financial Services": [
    "banking services", "insurance services", "atm installation",
    "bank", "banking", "insurance", "financial",
    "atm", "loan", "microfinance", "credit"
  ],
  "Training & Skill Development": [
    "skill development", "capacity building", "vocational training",
    "training", "workshop", "seminar", "certification"
  ],
  "GIS & Survey": [
    "drone survey", "topographical survey", "lidar survey",
    "gis", "dgps", "survey", "mapping", "lidar",
    "remote sensing", "total station"
  ],
  "Environmental Services": [
    "environmental monitoring", "air quality monitoring", "water quality testing",
    "environment", "pollution", "eia", "environment clearance"
  ],
  "Animal Husbandry & Veterinary": [
    "animal husbandry", "veterinary services",
    "veterinary", "livestock", "cattle", "goat",
    "dairy", "poultry", "fodder"
  ],
  "Food & Civil Supplies": [
    "mid day meal", "food grain supply", "ration supply",
    "rice", "wheat", "pulse", "ration", "food grain",
    "pds", "fci", "nutrition"
  ],
  "Smart City": [
    "smart city mission", "command control center",
    "smart city", "iccc", "smart pole", "iot",
    "smart parking", "intelligent traffic"
  ],
  "Disaster Management": [
    "disaster management", "flood relief", "emergency response",
    "disaster", "emergency", "flood", "cyclone",
    "earthquake", "rescue", "relief"
  ],
  "Urban Development": [
    "storm water drain", "street furniture", "footpath development",
    "town planning", "urban development",
    "municipal", "beautification", "urban",
    "footpath", "park", "storm water"
  ],
  "Defence": [
    "border security", "ordnance factory", "military equipment",
    "army", "navy", "air force", "defence",
    "ordnance", "military", "drdo"
  ],
  "Hospitality & Accommodation": [
    "guest house", "accommodation facility",
    "hotel", "lodging", "hospitality", "tourism"
  ],
  "HR & Recruitment": [
    "contract manpower", "manpower supply", "human resource",
    "outsourcing", "recruitment", "staffing", "placement", "hr"
  ],
};

export const WORK_TYPE_DICTIONARY: Record<string, string[]> = {
  "Supply":        ["supply of", "procurement of", "purchase of", "supply", "procurement", "purchase"],
  "Construction":  ["construction of", "civil work", "erection of", "construction", "building", "erection"],
  "Repair":        ["repair of", "restoration of", "repair", "restoration", "rectification"],
  "Maintenance":   ["operation and maintenance", "annual maintenance contract", "maintenance", "amc", "o&m"],
  "Installation":  ["installation of", "commissioning of", "installation", "commissioning", "deployment"],
  "Consultancy":   ["consultancy for", "dpr preparation", "consultancy", "consultant", "pmc", "dpr", "design"],
  "Survey":        ["survey of", "inspection of", "survey", "inspection", "assessment", "mapping"],
  "Hiring":        ["hiring of", "rental of", "hiring", "rental", "lease", "renting"],
  "Outsourcing":   ["manpower supply", "facility management", "outsourcing"],
  "Fabrication":   ["fabrication of", "fabrication", "manufacturing", "assembly"],
  "Testing":       ["testing of", "quality control", "calibration of", "testing", "calibration"],
  "Training":      ["training program", "capacity building", "training", "workshop"],
  "Empanelment":   ["expression of interest", "empanelment of", "vendor registration", "prequalification",
                    "empanelment", "panel of vendors", "panel of agencies", "eoi", "enlistment"],
};

export interface CategorizationResult {
  category: string;
  workType: string | null;
  tags: string[];
  confidence: number; // 0-100
}

// ---------------------------------------------------------------------------
// STEMMED LOOKUP TABLES
// Pre-computed at load time so runtime categorization is fast.
// ---------------------------------------------------------------------------
interface StemmedEntry { original: string; stemmed: string; wordCount: number; }
const STEMMED_CATEGORIES = buildStemmedLookup(CATEGORY_DICTIONARY);
const STEMMED_WORK_TYPES = buildStemmedLookup(WORK_TYPE_DICTIONARY);

function buildStemmedLookup(dict: Record<string, string[]>): Record<string, StemmedEntry[]> {
  const result: Record<string, StemmedEntry[]> = {};
  for (const [cat, keywords] of Object.entries(dict)) {
    // Sort by word count DESC so multi-word phrases are evaluated first
    const entries: StemmedEntry[] = keywords
      .map(kw => ({
        original: kw.toLowerCase(),
        stemmed: stemPhrase(kw),
        wordCount: kw.split(/\s+/).length,
      }))
      .sort((a, b) => b.wordCount - a.wordCount);
    result[cat] = entries;
  }
  return result;
}

// ---------------------------------------------------------------------------
// TOKENIZE & STEM TEXT
// Splits text into tokens, removes stop words, stems each token.
// ---------------------------------------------------------------------------
const STOP_WORDS = new Set([
  'of', 'the', 'and', 'for', 'in', 'at', 'to', 'a', 'an', 'is', 'are',
  'was', 'were', 'by', 'on', 'with', 'from', 'as', 'be', 'this', 'that',
  'it', 'its', 'under', 'during', 'via', 'per', 'or', 'including',
]);

function tokenizeAndStem(text: string): string {
  const tokenizer = new natural.WordTokenizer();
  const tokens = tokenizer.tokenize(text.toLowerCase()) || [];
  return tokens
    .filter(t => t.length > 1 && !STOP_WORDS.has(t))
    .map(t => stemmer.stem(t))
    .join(' ');
}

// ---------------------------------------------------------------------------
// SCORER
// Scores a piece of text against a dictionary using:
// 1. Phrase-first evaluation (multi-word before single-word)
// 2. Word-boundary checking on original (unstemmed) text
// 3. Stemmed matching for singular/plural/verb forms
// 4. Bonus for multi-word phrase matches
// ---------------------------------------------------------------------------
function scoreText(
  originalText: string,
  stemmedText: string,
  entries: StemmedEntry[]
): number {
  let score = 0;

  for (const entry of entries) {
    let matched = false;

    // 1. Try exact word-boundary match on original text
    const exactRegex = wordBoundaryRegex(entry.original);
    if (exactRegex.test(originalText)) {
      matched = true;
      score += entry.wordCount * 2; // multi-word phrases get extra weight
    }

    // 2. Try stemmed match if exact didn't match
    if (!matched && entry.stemmed) {
      const stemRegex = wordBoundaryRegex(entry.stemmed);
      if (stemRegex.test(stemmedText)) {
        matched = true;
        score += entry.wordCount;
      }
    }
  }

  return score;
}

// ---------------------------------------------------------------------------
// MAIN EXPORT: categorizeTender
// ---------------------------------------------------------------------------
export function categorizeTender(
  rawTitle: string,
  rawDescription = '',
  rawTags = ''
): CategorizationResult {
  // Normalise text
  const title    = rawTitle.toLowerCase().replace(/[_\-]/g, ' ');
  const body     = (rawDescription + ' ' + rawTags).toLowerCase().replace(/[_\-]/g, ' ');
  const fullText = `${title} ${body}`;

  // Stemmed versions
  const stemmedTitle    = tokenizeAndStem(title);
  const stemmedBody     = tokenizeAndStem(body);
  const stemmedFull     = `${stemmedTitle} ${stemmedBody}`;

  // --- Categorize ---
  const catScores: Record<string, number> = {};
  let maxCatScore = 0;
  let bestCategory = 'Other / Miscellaneous';

  for (const [cat, entries] of Object.entries(STEMMED_CATEGORIES)) {
    // Title matches count 3× more than body
    const titleScore = scoreText(title, stemmedTitle, entries) * 3;
    const bodyScore  = scoreText(body,  stemmedBody,  entries);
    const total = titleScore + bodyScore;

    catScores[cat] = total;
    if (total > maxCatScore) {
      maxCatScore = total;
      bestCategory = cat;
    }
  }

  // Confidence: how dominant is the best category over the 2nd best?
  const sortedScores = Object.values(catScores).sort((a, b) => b - a);
  const topScore  = sortedScores[0] || 0;
  const nextScore = sortedScores[1] || 0;
  const confidence = topScore === 0 ? 0
    : Math.min(100, Math.round(((topScore - nextScore) / topScore) * 100));

  // --- Work type ---
  let bestWorkType: string | null = null;
  let maxWorkScore = 0;
  for (const [wt, entries] of Object.entries(STEMMED_WORK_TYPES)) {
    const titleScore = scoreText(title, stemmedTitle, entries) * 3;
    const bodyScore  = scoreText(body, stemmedBody, entries);
    const total = titleScore + bodyScore;
    if (total > maxWorkScore) {
      maxWorkScore = total;
      bestWorkType = wt;
    }
  }

  // --- Tags: curated, human-readable, search-worthy terms only ---
  // Strategy: use category + worktype + a small set of high-signal domain keywords.
  // We do NOT blindly surface matched dictionary phrases (which produce noise like
  // "sub centre building", "station", "lan" etc.)

  // Whitelist of meaningful single-concept tags that people actually search for
  // These are short, well-known, high-level industry terms
  const GOOD_DOMAIN_TAGS: string[] = [
    // Infrastructure & Civil
    'road', 'highway', 'bridge', 'culvert', 'flyover',
    // Water
    'water supply', 'irrigation', 'drainage', 'pipeline', 'borewell',
    // Power / Energy
    'solar', 'electrical', 'generator', 'transformer', 'street light',
    // Buildings
    'hospital', 'school', 'college', 'hostel', 'government building',
    // Medical
    'medical', 'ambulance', 'pharmacy',
    // Telecom
    'fiber', 'broadband', 'telecom',
    // Transport
    'railway', 'metro', 'vehicle hire',
    // IT
    'software', 'cctv', 'networking',
    // Environment
    'solid waste', 'sanitation',
    // Industrial
    'mining', 'fabrication', 'machinery',
    // Services
    'security', 'manpower', 'catering', 'housekeeping',
    // Others
    'survey', 'consultancy', 'audit', 'training',
  ];

  const domainTagSet = new Set<string>();
  for (const tag of GOOD_DOMAIN_TAGS) {
    const regex = wordBoundaryRegex(tag);
    if (regex.test(fullText)) {
      domainTagSet.add(tag);
      if (domainTagSet.size >= 3) break;
    }
  }

  // Build final tags: WorkType first, then Category, then up to 2 domain keywords
  const finalTags: string[] = [];

  if (bestWorkType) finalTags.push(bestWorkType);
  if (bestCategory && bestCategory !== 'Other / Miscellaneous') finalTags.push(bestCategory);

  for (const dt of domainTagSet) {
    if (finalTags.length >= 4) break;
    const alreadyCovered = finalTags.some(t => t.toLowerCase().includes(dt) || dt.includes(t.toLowerCase()));
    if (!alreadyCovered) finalTags.push(dt);
  }

  const capitalizedTags = finalTags
    .slice(0, 4)
    .map(t => t.charAt(0).toUpperCase() + t.slice(1));

  return {
    category: bestCategory,
    workType: bestWorkType,
    tags: capitalizedTags,
    confidence,
  };
}

