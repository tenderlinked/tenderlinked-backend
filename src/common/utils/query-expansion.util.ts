export const SYNONYM_DICTIONARY: Record<string, string[]> = {
  "computer": ["laptop", "desktop", "server", "hardware", "software", "information technology", "networking", "workstation"],
  "laptop": ["computer", "macbook", "notebook", "hardware", "information technology"],
  "hospital": ["medical", "healthcare", "clinic", "dispensary", "phc", "chc", "sub centre", "health centre", "doctor"],
  "medical": ["hospital", "healthcare", "surgical", "medicine", "drugs", "pharmacy", "clinic", "health"],
  "road": ["highway", "nhai", "morth", "street", "pavement", "asphalt", "bitumen", "flyover", "bridge", "lane"],
  "bridge": ["culvert", "flyover", "overbridge", "viaduct", "road"],
  "vehicle": ["jeep", "bolero", "innova", "scorpio", "truck", "transport", "automobile"],
  "car": ["vehicle", "jeep", "transport", "taxi", "automobile"],
  "school": ["education", "college", "university", "academic", "classroom"],
  "cctv": ["camera", "surveillance", "security camera", "video monitoring"],
  "software": ["application software", "website", "portal", "erp system", "information technology"],
  "furniture": ["chair", "table", "desk", "almirah", "cabinet", "bed", "interior"],
  "electricity": ["electrical", "power", "wiring", "cable", "transformer", "generator", "dg set", "lighting"],
  "water": ["pipeline", "plumbing", "drainage", "sewerage", "pump", "irrigation", "jal jeevan", "watco"],
  "food": ["diet", "catering", "meal", "ration", "grocery", "nutrition", "canteen"],
  "security": ["guard", "manpower", "watchman", "surveillance", "patrol", "bouncers"],
  "cleaning": ["housekeeping", "sanitation", "sweeping", "garbage", "waste management", "hygiene"],
};

/**
 * Expands a search query into an array of related semantic terms.
 * e.g., "computer" -> ["computer", "laptop", "pc", "desktop", "server", "hardware", "software", "it", "information technology"]
 */
export function expandSearchQuery(query: string): string[] {
  if (!query) return [];
  
  const terms = new Set<string>();
  const lowerQuery = query.toLowerCase().trim();
  
  // 1. Always include the exact original query
  terms.add(lowerQuery);

  // 2. Look for exact matches in the synonym dictionary
  if (SYNONYM_DICTIONARY[lowerQuery]) {
    SYNONYM_DICTIONARY[lowerQuery].forEach(syn => terms.add(syn));
  }

  // 3. Look for partial matches (if user searches "computers", match "computer")
  for (const [key, synonyms] of Object.entries(SYNONYM_DICTIONARY)) {
    if (lowerQuery.includes(key) || key.includes(lowerQuery)) {
      terms.add(key);
      synonyms.forEach(syn => terms.add(syn));
    }
  }

  // Return unique expanded terms
  return Array.from(terms);
}
