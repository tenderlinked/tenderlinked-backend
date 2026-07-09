const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  console.log("Fetching all tenders to clean authorities...");
  const tenders = await prisma.tender.findMany({
    select: { id: true, organisation: true }
  });

  let updatedCount = 0;
  for (const tender of tenders) {
    if (!tender.organisation) continue;
    
    let cleanedAuthority = tender.organisation.split('||')[0].trim();

    // Clean up specific ugly acronyms like CE RW I, CE RW II, etc.
    if (cleanedAuthority.match(/^CE RW\s*(I|II|III|IV)?$/i)) {
        cleanedAuthority = "Chief Engineer Rural Works";
    }

    if (cleanedAuthority !== tender.organisation) {
      await prisma.tender.update({
        where: { id: tender.id },
        data: { organisation: cleanedAuthority }
      });
      updatedCount++;
    }
  }

  console.log(`Successfully cleaned ${updatedCount} authorities.`);
}

run()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
