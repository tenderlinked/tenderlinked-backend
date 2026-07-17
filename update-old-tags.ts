import { PrismaClient } from '@prisma/client';
import { categorizeTender } from './src/common/utils/tender-categorizer.util';

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
      const categoryResult = categorizeTender(tender.title, tender.description || '');
      
      // Always update to overwrite stale tags from old categorizer
      await prisma.tender.update({
        where: { id: tender.id },
        data: {
          tenderCategory: categoryResult.category
        }
      });
      await prisma.tenderAiData.upsert({
        where: { tenderId: tender.id },
        create: { tenderId: tender.id, tags: categoryResult.tags },
        update: { tags: categoryResult.tags }
      });
      updatedCount++;
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
