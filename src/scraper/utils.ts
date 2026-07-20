import { getIndiaPincode } from 'india-pincode';
import { PrismaService } from '../prisma/prisma.service';

const pincodeEngine = getIndiaPincode();

export function lookupPincode(pin: string) {
  if (!pin || pin.length !== 6) return [];
  try {
    const res = pincodeEngine.getByPincode(pin);
    if (res && res.success && res.data && res.data.data) {
      // Map it to the old format so the rest of the scraper doesn't break
      return res.data.data.map((item: any) => ({
        officeName: `${item.area} ${item.officeType}`,
        pincode: item.pincode,
        taluk: item.area,
        districtName: item.district,
        stateName: item.state
      }));
    }
    return [];
  } catch (e) {
    return [];
  }
}

export function cleanCityName(location: string | null | undefined): string | null {
  if (!location) return null;
  
  const invalidKeywords = [
    'hospital', 'school', 'college', 'office', 'dept', 'department', 'university',
    'block', 'panchayat', 'municipality', 'division', 'zilla', 'parishad', 'sadan', 
    'institute', 'committee', 'health', 'center', 'centre', 'mission', 'corporation',
    'project', 'police', 'station', 'authority', 'board', 'bhavan', 'bhawan', 'complex',
    'limited', 'ltd', 'pvt', 'private', 'company'
  ];

  let cleaned = location
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // If it's a known invalid type of location phrase, return null
  const lowerCleaned = cleaned.toLowerCase();
  if (invalidKeywords.some(kw => lowerCleaned.includes(kw))) {
    return null;
  }
  
  // if it's too long, it's probably not just a city name
  if (cleaned.length > 30) {
    return null;
  }

  return toTitleCase(cleaned);
}

export function toTitleCase(str: string): string {
  if (!str) return str;
  return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}

export function extractLocationInfo(locationStr: string | null | undefined, allDistricts: {id: string, name: string}[], pincodeStr?: string | null): { city: string | null, district: string | null, regionDistrictId: string | null } {
  const result = { city: null as string | null, district: null as string | null, regionDistrictId: null as string | null };
  
  // 1. Try Pincode lookup first! (Highly accurate)
  if (pincodeStr) {
    const pin = pincodeStr.replace(/[^0-9]/g, '');
    if (pin.length === 6) {
      try {
        const pinResults = lookupPincode(pin);
        if (pinResults && pinResults.length > 0) {
          // Find the best valid result by matching against the raw location string if available
          let info = pinResults[0];
          
          if (locationStr) {
            const locLower = locationStr.toLowerCase();
            const matchedInfo = pinResults.find(r => {
              if (r.taluk && r.taluk.toUpperCase() !== 'NA') {
                return locLower.includes(r.taluk.toLowerCase());
              }
              const officeCity = r.officeName.replace(/ B\.O| S\.O| H\.O| V\.P\.O| P\.O/gi, '').trim().toLowerCase();
              return locLower.includes(officeCity);
            });
            if (matchedInfo) {
              info = matchedInfo;
            } else {
              // fallback to first non-NA if no string match found
              info = pinResults.find(r => r.taluk && r.taluk.toUpperCase() !== 'NA') || pinResults[0];
            }
          } else {
            info = pinResults.find(r => r.taluk && r.taluk.toUpperCase() !== 'NA') || pinResults[0];
          }

          let pinDistrictLower = info.districtName.toLowerCase();
          let stateForAlias = info.stateName.toLowerCase();
          


          const matchedDistrict = allDistricts.find(d => {
             const dLower = d.name.toLowerCase();
             return dLower === pinDistrictLower || dLower.includes(pinDistrictLower) || pinDistrictLower.includes(dLower);
          });
          
          // Clean up city name
          let cityVal = info.taluk;
          if (!cityVal || cityVal.toUpperCase() === 'NA') {
            cityVal = info.officeName.replace(/ B\.O| S\.O| H\.O| V\.P\.O| P\.O/gi, '').trim();
          }
          
          // Major cities where district is essentially the city
          const majorCities = ['KOLKATA', 'MUMBAI', 'CHENNAI', 'DELHI', 'NEW DELHI', 'BENGALURU', 'BANGALORE', 'HYDERABAD', 'PUNE', 'AHMEDABAD', 'JAIPUR', 'SURAT', 'LUCKNOW', 'KANPUR', 'NAGPUR', 'INDORE', 'BHOPAL', 'PATNA', 'VADODARA', 'CHANDIGARH'];
          
          // Special cases: 
          // 1. If it's a major city-district, use the district name.
          // 2. If the raw location string matches the district name, prefer the district name.
          if (info.districtName && majorCities.includes(info.districtName.toUpperCase())) {
             cityVal = info.districtName;
          } else if (locationStr) {
             const locLower = locationStr.toLowerCase();
             if (info.districtName && locLower.includes(info.districtName.toLowerCase())) {
                cityVal = info.districtName;
             } else if (matchedDistrict && locLower.includes(matchedDistrict.name.toLowerCase())) {
                cityVal = matchedDistrict.name;
             }
          }

          result.city = cityVal ? toTitleCase(cityVal) : null;
          
          if (matchedDistrict) {
            result.district = toTitleCase(matchedDistrict.name);
            result.regionDistrictId = matchedDistrict.id;
          } else {
            // Use the raw postal district name if we can't link it to a RegionDistrict ID
            result.district = toTitleCase(info.districtName);
          }
          
          return result; // We extracted info from pincode!
        }
      } catch (e) {
        // ignore lookup errors
      }
    }
  }

  // 2. Fallback to extracting from location string
  if (!locationStr) return result;

  const parts = locationStr.split(/[\s,-/]+/).filter(p => p.length > 2);
  for (const part of parts) {
    const cleanPart = part.toLowerCase();
    
    // Check if part matches a district
    const matchedDistrict = allDistricts.find(d => 
      cleanPart === d.name.toLowerCase() || 
      cleanPart.includes(" " + d.name.toLowerCase())
    );

    if (matchedDistrict) {
      result.district = toTitleCase(matchedDistrict.name);
      result.regionDistrictId = matchedDistrict.id;
      // Assume the part before or exactly matching is the city
      const cityCandidate = cleanCityName(part);
      if (cityCandidate) {
        result.city = cityCandidate;
      }
      break; // found it
    }
  }

  // Fallback: If no district match, just try to get a clean city from the first/second part
  if (!result.city) {
    for (const part of parts) {
      const cityCandidate = cleanCityName(part);
      if (cityCandidate) {
        result.city = cityCandidate;
        break;
      }
    }
  }
  return result;
}

export function parseDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  const parsed = new Date(dateStr);
  if (isNaN(parsed.getTime())) return null;
  return parsed;
}

export function extractTenderId(str: string | null): string | null {
  if (!str) return null;
  const match = str.match(/([a-zA-Z0-9]+_[\w]+_[\w]+)/) || str.match(/[a-zA-Z0-9]+_[a-zA-Z0-9]+_\d+/);
  return match ? match[0] : str.trim();
}

export function parseAmount(str: string | null): number {
  if (!str) return 0;
  const match = str.replace(/,/g, '').match(/[\d.]+/);
  return match ? parseFloat(match[0]) : 0;
}

export function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function sanitizeText(text: string | null | undefined): string {
  if (!text) return '';
  return text.replace(/\s+/g, ' ').trim();
}

export function extractTenderValue(text: string | null): number {
  return parseAmount(text);
}

export async function getStateAbbr(prisma: any, stateName: string): Promise<string> {
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
  return clean.substring(0, 2).toUpperCase(); // default
}

/**
 * Generate sequence-based tender code (TL-[STATE]-XXXXXX)
 * Examples: TL-OD-000001, TL-AP-000001, TL-MH-000001
 */
export async function generateTenderCode(prisma: any, stateName: string): Promise<string> {
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
