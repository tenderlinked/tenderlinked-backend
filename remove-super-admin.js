const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const result = await prisma.userProfile.updateMany({
    where: { email: 'imsahadeb@gmail.com' },
    data: { globalRole: 'USER' }
  });
  console.log(`Downgraded ${result.count} user(s) to USER`);
}

run().finally(() => prisma.$disconnect());
