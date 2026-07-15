const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const count = await prisma.tender.count({
    where: {
      documentsDownloaded: false,
      aiSummary: { not: null, not: '' }
    }
  });
  console.log('Mismatch count:', count);
  
  // Let's fix them!
  const res = await prisma.tender.updateMany({
    where: {
      documentsDownloaded: false,
      aiSummary: { not: null, not: '' }
    },
    data: {
      documentsDownloaded: true
    }
  });
  console.log('Fixed count:', res.count);
  await prisma.$disconnect();
}
main();
