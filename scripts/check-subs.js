const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const subs = await prisma.userSubscription.findMany();
  console.log(subs);
  await prisma.$disconnect();
}
check();
