import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const renames: Record<string, string> = {
  "Deogarh": "Debagarh",
  "Balasore": "Baleswar",
  "Purulia": "Puruliya",
  "Purba Burdwan": "Purba Bardhaman",
  "Paschim Burwan": "Paschim Bardhaman", // fixing typo in DB as well
  "Paschim Medinipur (West Medinipur)": "Paschim Medinipur (West Midnapore)",
  "Purba Medinipur (East Medinipur)": "Purba Medinipur (East Midnapore)"
};

async function run() {
  console.log('Renaming districts in RegionDistrict table...');
  let count = 0;
  for (const [oldName, newName] of Object.entries(renames)) {
    try {
      const dists = await prisma.regionDistrict.findMany({
        where: { name: oldName }
      });
      
      for (const dist of dists) {
        await prisma.regionDistrict.update({
          where: { id: dist.id },
          data: { name: newName }
        });
        console.log(`Renamed: ${oldName} -> ${newName}`);
        count++;
      }
    } catch (e) {
      console.error('Error renaming', oldName, e);
    }
  }
  console.log(`Successfully renamed ${count} districts.`);
}

run();
