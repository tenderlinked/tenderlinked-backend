import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function run() {
  const pincodeDataPath = path.join(__dirname, 'node_modules', 'india-pincode-lookup', 'pincodes.json');
  const rawData = fs.readFileSync(pincodeDataPath, 'utf8');
  const pincodes = JSON.parse(rawData);

  // Group postal districts by state
  const postalStateDistricts: Record<string, Set<string>> = {};
  for (const p of pincodes) {
    if (!postalStateDistricts[p.stateName]) {
      postalStateDistricts[p.stateName] = new Set();
    }
    postalStateDistricts[p.stateName].add(p.districtName);
  }

  // Fetch all db districts
  const dbStates = await prisma.regionState.findMany({
    include: { districts: true }
  });

  let mismatchCount = 0;
  
  for (const dbState of dbStates) {
    // try to find matching state in postal data
    const postalStateName = Object.keys(postalStateDistricts).find(s => 
      s.toLowerCase() === dbState.name.toLowerCase() || 
      s.toLowerCase().includes(dbState.name.toLowerCase()) ||
      dbState.name.toLowerCase().includes(s.toLowerCase())
    );

    if (!postalStateName) {
      console.log(`Could not find postal state matching DB state: ${dbState.name}`);
      continue;
    }

    const postalDists = Array.from(postalStateDistricts[postalStateName]).map(d => d.toLowerCase());
    
    for (const dbDist of dbState.districts) {
      const dbDistLower = dbDist.name.toLowerCase();
      // exact match?
      if (postalDists.includes(dbDistLower)) {
        continue; // good
      }
      
      // substring match?
      const subMatch = postalDists.find(pd => pd.includes(dbDistLower) || dbDistLower.includes(pd));
      if (subMatch) {
        console.log(`[${dbState.name}] Substring match: DB "${dbDist.name}" -> Postal "${subMatch}"`);
        mismatchCount++;
      } else {
        console.log(`[${dbState.name}] NO MATCH: DB "${dbDist.name}"`);
        mismatchCount++;
      }
    }
  }

  console.log(`Total mismatches found: ${mismatchCount}`);
}

run();
