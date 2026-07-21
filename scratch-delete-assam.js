const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  try {
    const result = await prisma.tender.deleteMany({
      where: {
        state: {
          contains: 'assam',
          mode: 'insensitive'
        }
      }
    });
    console.log('Deleted tenders from DB:', result.count);
  } catch(e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

run();
