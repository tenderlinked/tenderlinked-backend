import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function run() {
  await prisma.$executeRawUnsafe('DROP TABLE "Tender" CASCADE;');
  console.log('Dropped Tender table');
}
run();
