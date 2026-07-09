import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Clearing all tender-related data...');

  try {
    // Delete dependent records first if necessary, though relations are just string references
    // in TenantTenderAction and TenantUnlockedTender without explicit Foreign Keys in Prisma.
    // However, it's safe to clear them as well to avoid orphaned references.
    const deletedActions = await prisma.tenantTenderAction.deleteMany({});
    console.log(`Deleted ${deletedActions.count} TenantTenderAction records.`);

    const deletedUnlocked = await prisma.tenantUnlockedTender.deleteMany({});
    console.log(`Deleted ${deletedUnlocked.count} TenantUnlockedTender records.`);

    const deletedScrapeLogs = await prisma.scrapeLog.deleteMany({});
    console.log(`Deleted ${deletedScrapeLogs.count} ScrapeLog records.`);

    const deletedTenders = await prisma.tender.deleteMany({});
    console.log(`Deleted ${deletedTenders.count} Tender records.`);

    await prisma.$executeRaw`ALTER SEQUENCE "Tender_localId_seq" RESTART WITH 1;`;
    console.log(`Reset Tender_localId_seq auto-increment sequence to 1.`);

    console.log('Successfully cleared all tender data.');
  } catch (error) {
    console.error('Error clearing tender data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
