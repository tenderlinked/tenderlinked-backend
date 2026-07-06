const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const user = await prisma.userProfile.findFirst({ where: { email: 'mymail.sahadeb@gmail.com' } });
  console.log('User in DB:', user);
}

run().finally(() => prisma.$disconnect());
