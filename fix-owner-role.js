const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const result = await prisma.role.updateMany({
    where: { name: 'Tanent Owner', isSystemRole: true },
    data: { permissions: ['*'] }
  });
  console.log(`Updated ${result.count} Tanent Owner roles to have full access ['*']`);
}

run().finally(() => prisma.$disconnect());
