const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const stateCodeMap = {
  'Andhra Pradesh': 'AP',
  'Arunachal Pradesh': 'AR',
  'Assam': 'AS',
  'Bihar': 'BR',
  'Chandigarh (UT)': 'CH',
  'Chhattisgarh': 'CG',
  'Dadra and Nagar Haveli (UT)': 'DN',
  'Daman and Diu (UT)': 'DD',
  'Delhi (NCT)': 'DL',
  'Goa': 'GA',
  'Gujarat': 'GJ',
  'Haryana': 'HR',
  'Himachal Pradesh': 'HP',
  'Jammu and Kashmir': 'JK',
  'Jharkhand': 'JH',
  'Karnataka': 'KA',
  'Kerala': 'KL',
  'Lakshadweep (UT)': 'LD',
  'Madhya Pradesh': 'MP',
  'Maharashtra': 'MH',
  'Manipur': 'MN',
  'Meghalaya': 'ML',
  'Mizoram': 'MZ',
  'Nagaland': 'NL',
  'Odisha': 'OD',
  'Puducherry (UT)': 'PY',
  'Punjab': 'PB',
  'Rajasthan': 'RJ',
  'Sikkim': 'SK',
  'Tamil Nadu': 'TN',
  'Telangana': 'TS',
  'Tripura': 'TR',
  'Uttarakhand': 'UK',
  'Uttar Pradesh': 'UP',
  'West Bengal': 'WB'
};

async function main() {
  let count = 0;
  for (const [name, code] of Object.entries(stateCodeMap)) {
    const res = await prisma.regionState.updateMany({
      where: { name },
      data: { code },
    });
    count += res.count;
  }
  console.log(`Successfully updated ${count} state codes in RegionState table.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
