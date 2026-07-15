const { PrismaClient } = require('@prisma/client');
const { categorizeTender } = require('./src/common/utils/tender-categorizer.util.ts');

const prisma = new PrismaClient();

async function main() {
  console.log('Fetching all tenders...');
  
  // We'll process them in batches to not blow up memory
  let processedCount = 0;
  let updatedCount = 0;
  let skip = 0;
  const take = 1000;
  
  while (true) {
    const tenders = await prisma.tender.findMany({
      select: { id: true, title: true, description: true },
      skip,
      take,
      orderBy: { id: 'asc' }
    });
    
    if (tenders.length === 0) break;
    
    for (const tender of tenders) {
      const combinedRawText = `${tender.title} ${tender.description || ''}`;
      const categoryResult = categorizeTender(combinedRawText);
      
      // If we found a valid category or tags
      if (categoryResult.tags && categoryResult.tags.length > 0) {
        await prisma.tender.update({
          where: { id: tender.id },
          data: {
            tags: categoryResult.tags
          }
        });
        updatedCount++;
      }
      processedCount++;
      
      if (processedCount % 500 === 0) {
        console.log(`Processed ${processedCount} tenders...`);
      }
    }
    
    skip += take;
  }
  
  console.log(`Finished! Processed: ${processedCount}. Updated tags for: ${updatedCount}.`);
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
