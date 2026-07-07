import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

async function run() {
  const prisma = new PrismaClient();

  const tenders = await prisma.tender.findMany({
    where: {
      level: 'STATE',
    },
    take: 10
  });

  console.log(`Found ${tenders.length} state tenders in DB:`);
  for (const t of tenders) {
    const pdfPath = path.join(process.cwd(), 'downloads', `tender_${t.id}.pdf`);
    const fileExists = fs.existsSync(pdfPath);
    console.log(`- ID: ${t.id}`);
    console.log(`  Title: ${t.title.substring(0, 60)}`);
    console.log(`  EMD: ${t.emd}`);
    console.log(`  Notice PDF URL: ${t.noticePdfUrl}`);
    console.log(`  PDF on disk: ${fileExists} (${pdfPath})`);
  }

  await prisma.$disconnect();
}

run();
