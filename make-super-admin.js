const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const result = await prisma.userProfile.updateMany({
    where: { email: 'imsahadeb@gmail.com' },
    data: { globalRole: 'SUPER_ADMIN' }
  });
  console.log(`Updated ${result.count} user(s) to SUPER_ADMIN`);
}

run().finally(() => prisma.$disconnect());
