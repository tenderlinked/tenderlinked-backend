import { PrismaClient } from '@prisma/client';
import { extractLocationInfo } from './src/scraper/utils';

const prisma = new PrismaClient();

async function run() {
  console.log('Fetching all districts...');
  const allDistricts = await prisma.regionDistrict.findMany({ select: { id: true, name: true } });
  
  console.log('Fetching all tenders...');
  const tenders = await prisma.tender.findMany({
    select: {
      id: true,
      pincode: true,
      location: true,
      city: true,
      district: true,
      regionDistrictId: true
    }
  });
  
  console.log(`Found ${tenders.length} tenders. Starting backfill...`);
  
  let updateCount = 0;
  for (const t of tenders) {
    if (!t.pincode && !t.location) continue; // nothing to extract from
    
    const extracted = extractLocationInfo(t.location, allDistricts, t.pincode);
    
    const cityChanged = extracted.city !== t.city;
    const districtChanged = extracted.district !== t.district;
    const regionIdChanged = extracted.regionDistrictId !== t.regionDistrictId;
    
    if (cityChanged || districtChanged || regionIdChanged) {
      try {
        await prisma.tender.update({
          where: { id: t.id },
          data: {
            city: extracted.city,
            district: extracted.district,
            regionDistrictId: extracted.regionDistrictId
          }
        });
        updateCount++;
      } catch (e) {
        console.error(`Error updating tender ${t.id}`, e);
      }
    }
  }
  
  console.log(`Successfully backfilled location data for ${updateCount} tenders.`);
}

run();
