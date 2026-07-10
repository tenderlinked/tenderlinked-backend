import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const wbMappings: Record<string, string> = {
  "DEPARTMENT OF HIGHER EDUCATION": "Department of Higher Education",
  "DEPARTMENT OF MASS EDUCATION EXTENSION AND LIBRARY SERVICES": "Department of Mass Education Extension and Library Services",
  "DIRECTORATE OF MASS EDUCATION EXTENSION": "Directorate of Mass Education Extension",
  "DISTRICT MAGISTRATE BURDWAN": "District Magistrate",
  "DISTRICT MAGISTRATE COOCH BEHAR": "District Magistrate",
  "DISTRICT MAGISTRATE DAKSHIN DINAJPUR": "District Magistrate",
  "DISTRICT MAGISTRATE DARJEELING": "District Magistrate",
  "DISTRICT MAGISTRATE KALIMPONG": "District Magistrate",
  "DISTRICT MAGISTRATE MALDA": "District Magistrate",
  "DISTRICT MAGISTRATE MURSHIDABAD": "District Magistrate",
  "DISTRICT MAGISTRATE NORTH 24 PARGANAS": "District Magistrate",
  "DISTRICT MAGISTRATE PURULIA": "District Magistrate",
  "DISTRICT MAGISTRATE SOUTH 24 PARGANAS": "District Magistrate",
  "HOME AND HILL AFFAIRS DEPARTMENT": "Home and Hill Affairs Department",
  "HOUSING DIRECTORATE": "Housing Directorate",
  "KOLKATA MUNICIPAL CORPORATION": "Kolkata Municipal Corporation",
  "MUNICIPAL AFFAIRS DEPARTMENT": "Municipal Affairs Department",
  "PUBLIC WORKS DEPARTMENT": "Public Works Department",
  "PW(ROADS)(NH)": "Public Works (Roads), National Highways",
  "WEST BENGAL POLICE": "West Bengal Police",
  "WEST BENGAL STATE SEED CORPORATION LTD.": "West Bengal State Seed Corporation Limited",
  "Zilla Parishad": "Zilla Parishad"
};

async function run() {
  console.log('Upserting and normalizing', Object.keys(wbMappings).length, 'West Bengal organisations...');
  let count = 0;
  for (const [rawName, normalizedName] of Object.entries(wbMappings)) {
    try {
      await prisma.organisationMapping.upsert({
        where: { rawName: rawName },
        update: {
          normalizedName: normalizedName,
          isMapped: true
        },
        create: {
          rawName: rawName,
          state: 'West Bengal',
          normalizedName: normalizedName,
          isMapped: true
        }
      });
      count++;
    } catch (e) {
      console.error('Error with', rawName, e);
    }
  }
  console.log('Successfully added and normalized', count, 'West Bengal organisations');
}

run();
