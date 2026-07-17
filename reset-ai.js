const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function reset() {
  console.log("Resetting all AI extracted data...");
  
  // 1. Reset all tenders to unprocessed state
  const updated = await prisma.tender.updateMany({
    data: {
      aiProcessed: false,
      tags: [],
      tenderCategory: null,
      aiSummary: null,
      documentsDownloaded: false
    }
  });
  console.log(`Reset ${updated.count} tenders to unprocessed state.`);

  // 2. Delete all extracted BOQ data
  const deletedBoqs = await prisma.tenderBoq.deleteMany({});
  console.log(`Deleted ${deletedBoqs.count} BOQ records.`);

  // 3. Delete all extracted PDF text data
  const deletedText = await prisma.tenderDocumentText.deleteMany({});
  console.log(`Deleted ${deletedText.count} extracted document texts.`);

  console.log("Fresh start ready! The queue processor will pick these up automatically.");
}

reset()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
