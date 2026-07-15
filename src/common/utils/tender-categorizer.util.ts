export const CATEGORY_DICTIONARY: Record<string, string[]> = {
  "Roads & Highways": ["road", "highway", "asphalt", "bitumen", "pothole", "nhai", "morth", "pavement", "bridge", "culvert"],
  "Civil Works": ["building", "concrete", "cement", "construction", "plumbing", "civil", "renovation", "masonry", "earthwork", "architect", "structural", "demolition"],
  "Medical & Hospital": ["medicine", "surgical", "hospital", "x-ray", "mri", "ambulance", "drugs", "pharmacy", "medical equipment", "clinic", "healthcare", "pharma"],
  "Electrical": ["transformer", "cable", "wiring", "substation", "switchgear", "ht/lt", "electrical", "transmission", "generator", "dg set", "illumination", "led"],
  "IT & Software": ["software", "hardware", "server", "laptop", "networking", "cctv", "computer", "it infrastructure", "website", "application", "lan", "wan", "cloud", "data center", "printer"],
  "Water & Sanitation": ["water supply", "pipeline", "sewage", "drainage", "pump", "stp", "wtp", "plumbing", "sanitation", "borewell", "irrigation", "dam", "canal", "jal jeevan"],
  "Vehicles & Transport": ["vehicle", "car", "bus", "truck", "transport", "hiring of vehicle", "fleet", "logistics", "tyres", "automobile"],
  "Security Services": ["security guard", "manpower", "cctv", "surveillance", "watchman", "bouncers", "access control", "fire alarm", "fire extinguisher"],
  "Catering & Housekeeping": ["catering", "food", "canteen", "housekeeping", "cleaning", "sweeping", "sanitation", "pest control", "laundry", "dietary"],
  "Printing & Stationery": ["printing", "stationery", "paper", "xerox", "binding", "books", "toner", "cartridge", "flex", "hoarding"],
  "Solar & Renewable Energy": ["solar", "photovoltaic", "pv module", "renewable", "wind energy", "solar pump", "solar street light", "biogas"],
  "Agriculture & Forestry": ["agriculture", "seeds", "fertilizer", "pesticides", "tractor", "forestry", "plantation", "horticulture", "saplings", "nursery"],
  "Mining & Minerals": ["mining", "coal", "iron ore", "minerals", "drilling", "blasting", "quarry", "excavation", "sand"],
  "Consultancy & Professional Services": ["consultancy", "audit", "survey", "chartered accountant", "architectural consultancy", "project management", "pmc", "legal", "valuation"],
  "Event Management": ["event", "tent", "exhibition", "shamiana", "decoration", "stage", "sound system", "photography", "videography", "banquet"],
  "Textiles & Garments": ["uniform", "stitching", "cloth", "garments", "textile", "blanket", "bedsheet", "shoes", "canvas"],
  "Furniture & Fixtures": ["furniture", "chair", "table", "almirah", "rack", "desk", "sofa", "interior", "modular"],
  "Machinery & Equipment": ["machinery", "equipment", "compressor", "boiler", "cnc", "lathe", "welding", "crane", "forklift", "spares", "lubricants"],
  "Aviation & Aerospace": ["aviation", "aircraft", "helicopter", "airport", "runway", "aeronautical", "uav", "drone"],
  "Marine & Shipping": ["marine", "ship", "boat", "vessel", "port", "dredging", "cargo", "freight", "navy"],
  "Sports & Recreation": ["sports", "stadium", "gymnasium", "play ground", "playground", "athletic", "turf", "swimming pool", "fitness"],
  "Railways & Metro": ["railway", "rail", "track", "coach", "wagon", "locomotive", "signaling", "signal", "overhead equipment", "ohe", "rdso", "ircon", "railtel", "metro", "station", "platform"],
  "Telecom & Communication": ["telecom", "fiber", "ofc", "optical fiber", "broadband", "internet", "gsm", "4g", "5g", "tower", "bts", "epabx", "voip", "wireless", "communication", "router", "switch"],
  "Oil & Gas": ["oil", "gas", "petroleum", "diesel", "lpg", "png", "refinery", "pipeline", "compressor", "fuel", "iocl", "hpcl", "bpcl", "ongc", "gail", "terminal"],
  "Power Generation": ["thermal", "hydro", "power plant", "turbine", "boiler", "generator", "ash handling", "coal handling", "powerhouse", "steam", "cooling tower"],
  "Education": ["school", "college", "university", "classroom", "smart class", "laboratory", "library", "hostel", "education", "teaching", "training institute"],
  "Laboratory & Scientific": ["laboratory", "lab", "scientific", "reagent", "chemical", "testing", "calibration", "pathology", "microscope", "spectrometer", "nabl"],
  "Fire Safety": ["fire fighting", "firefighting", "hydrant", "sprinkler", "smoke detector", "fire alarm", "fire pump", "fire extinguisher", "fire suppression"],
  "Waste Management": ["solid waste", "garbage", "waste collection", "landfill", "compost", "biomedical waste", "waste processing", "door to door collection", "municipal waste"],
  "HVAC": ["hvac", "air conditioner", "ac", "ventilation", "chiller", "cooling tower", "ahu", "duct", "vrf", "vrv", "exhaust fan"],
  "Industrial Supplies": ["bearing", "valve", "pipe", "flange", "industrial gas", "fastener", "tool", "consumables", "industrial equipment"],
  "Chemicals": ["chemical", "acid", "alkali", "solvent", "industrial chemical", "laboratory chemical", "gas cylinder", "lubricant"],
  "Banking & Financial Services": ["bank", "banking", "insurance", "financial", "atm", "loan", "microfinance", "credit"],
  "HR & Recruitment": ["recruitment", "staffing", "outsourcing", "human resource", "hr", "placement", "contract manpower", "skilled manpower"],
  "Training & Skill Development": ["training", "capacity building", "skill development", "workshop", "seminar", "certification", "vocational"],
  "GIS & Survey": ["gis", "dgps", "survey", "mapping", "drone survey", "lidar", "remote sensing", "total station", "topographical survey"],
  "Environmental Services": ["environment", "pollution", "environmental monitoring", "eia", "air quality", "water quality", "environment clearance"],
  "Animal Husbandry & Veterinary": ["veterinary", "livestock", "cattle", "goat", "dairy", "poultry", "animal husbandry", "fodder"],
  "Fisheries & Aquaculture": ["fishery", "aquaculture", "fish seed", "pond", "hatchery", "shrimp", "marine fish"],
  "Food & Civil Supplies": ["rice", "wheat", "pulse", "ration", "food grain", "mid day meal", "pds", "fci", "nutrition"],
  "Smart City": ["smart city", "iccc", "command control center", "smart pole", "iot", "smart parking", "intelligent traffic"],
  "Disaster Management": ["disaster", "emergency", "flood", "cyclone", "earthquake", "rescue", "relief", "disaster response"],
  "Urban Development": ["municipal", "beautification", "urban", "town planning", "footpath", "park", "storm water", "street furniture"],
  "Industrial Automation": ["plc", "scada", "dcs", "automation", "instrumentation", "control panel", "industrial automation"],
  "Manufacturing": ["fabrication", "machining", "production", "assembly", "manufacturing", "casting", "forging", "sheet metal"],
  "Defence": ["army", "navy", "air force", "defence", "ordnance", "military", "drdo", "border security"],
  "Hospitality & Accommodation": ["hotel", "guest house", "accommodation", "lodging", "hospitality", "tourism"],
  "Advertising & Media": ["advertisement", "media", "newspaper", "radio", "television", "digital marketing", "branding", "publicity"],
  "Research & Development": ["research", "innovation", "prototype", "r&d", "pilot project", "technology development"],
  "Employment & Staffing": ["employment", "recruitment", "staffing", "manpower", "manpower supply", "outsourcing", "contract staff", "temporary staff", "skilled manpower", "unskilled manpower", "hr", "human resource", "placement", "consultant", "data entry operator", "deo", "office assistant", "computer operator", "operator", "driver", "security guard", "housekeeping", "helper", "technician", "engineer", "supervisor", "nursing staff", "medical officer", "faculty", "teacher", "trainer", "interview", "walk in interview", "selection", "hiring", "deployment", "resource augmentation"]
};

export const WORK_TYPE_DICTIONARY: Record<string, string[]> = {
  "Supply": ["supply", "procurement", "purchase"],
  "Construction": ["construction", "building", "civil work", "erection"],
  "Repair": ["repair", "restoration", "rectification"],
  "Maintenance": ["maintenance", "annual maintenance", "amc", "o&m", "operation and maintenance"],
  "Installation": ["installation", "commissioning", "erection", "deployment"],
  "Consultancy": ["consultancy", "consultant", "pmc", "dpr", "design"],
  "Survey": ["survey", "inspection", "assessment", "mapping"],
  "Hiring": ["hiring", "rental", "lease", "renting"],
  "Outsourcing": ["outsourcing", "manpower supply", "facility management"],
  "Fabrication": ["fabrication", "manufacturing", "assembly"],
  "Testing": ["testing", "quality control", "calibration"],
  "Training": ["training", "capacity building", "workshop"],
  "Empanelment": ["empanelment", "empanel", "empanelled", "panel", "panel of vendors", "panel of agencies", "panel of consultants", "panel of service providers", "vendor registration", "approved vendor", "approved supplier", "enlistment", "prequalification", "pre-qualification", "eoi", "expression of interest"]
};

export interface CategorizationResult {
  category: string;
  workType: string | null;
  tags: string[];
}

function calculateBestMatch(text: string, dictionary: Record<string, string[]>): string | null {
  const scores: Record<string, number> = {};
  let maxScore = 0;
  let bestMatch: string | null = null;
  
  for (const [key, keywords] of Object.entries(dictionary)) {
    let score = 0;
    for (const keyword of keywords) {
      const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
      const matches = text.match(regex);
      if (matches) {
        score += matches.length;
      }
    }
    scores[key] = score;
    
    if (score > maxScore) {
      maxScore = score;
      bestMatch = key;
    }
  }
  
  return maxScore > 0 ? bestMatch : null;
}

export function categorizeTender(rawText: string): CategorizationResult {
  const text = rawText.toLowerCase();
  
  const bestCategory = calculateBestMatch(text, CATEGORY_DICTIONARY) || "Other / Miscellaneous";
  const bestWorkType = calculateBestMatch(text, WORK_TYPE_DICTIONARY);

  // Generate some tags based on matched keywords across all categories
  const matchedKeywords = new Set<string>();
  
  // Combine all keywords for tag scanning
  for (const keywords of Object.values(CATEGORY_DICTIONARY)) {
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        matchedKeywords.add(keyword);
      }
    }
  }
  
  for (const keywords of Object.values(WORK_TYPE_DICTIONARY)) {
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        matchedKeywords.add(keyword);
      }
    }
  }
  
  // Take up to 3 tags
  const tags = Array.from(matchedKeywords).slice(0, 3);
  
  // Always include the main category and work type as tags if we have them
  if (bestWorkType && !tags.includes(bestWorkType.toLowerCase())) {
      tags.unshift(bestWorkType.toLowerCase());
  }
  
  if (bestCategory !== "Other / Miscellaneous" && !tags.includes(bestCategory.toLowerCase())) {
      tags.unshift(bestCategory.toLowerCase());
  }
  
  // Deduplicate and capitalize
  const finalTags = Array.from(new Set(tags)).map(t => t.charAt(0).toUpperCase() + t.slice(1)).slice(0, 4);

  return {
    category: bestCategory,
    workType: bestWorkType,
    tags: finalTags
  };
}
