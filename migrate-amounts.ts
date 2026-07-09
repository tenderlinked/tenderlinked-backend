const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  console.log("Fetching all tenders...");
  const tenders = await prisma.tender.findMany({
    where: { tenderValue: { not: null } },
    select: { id: true, tenderValue: true }
  });

  console.log(`Found ${tenders.length} tenders with a tenderValue.`);
  
  let updatedCount = 0;
  for (const tender of tenders) {
    if (!tender.tenderValue) continue;
    
    // Remove ₹, commas, and other non-numeric chars except . and digits, and handle "Lac"/"Cr"
    let valStr = tender.tenderValue.trim().toLowerCase();
    
    // Handle NA
    if (valStr === 'na' || valStr === 'not applicable') {
      await prisma.tender.update({ where: { id: tender.id }, data: { tenderAmount: null } });
      continue;
    }

    let multiplier = 1;
    if (valStr.includes('lac') || valStr.includes('lakh')) multiplier = 100000;
    if (valStr.includes('cr') || valStr.includes('crore')) multiplier = 10000000;

    // Strip everything except numbers and decimal point
    let cleanStr = valStr.replace(/[^0-9.]/g, '');
    let amount = parseFloat(cleanStr);
    
    if (!isNaN(amount)) {
      amount = amount * multiplier;
      await prisma.tender.update({
        where: { id: tender.id },
        data: { tenderAmount: amount }
      });
      updatedCount++;
    }
  }

  console.log(`Successfully migrated ${updatedCount} tender amounts.`);
}

run()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
