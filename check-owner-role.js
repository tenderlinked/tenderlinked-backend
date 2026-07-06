const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const role = await prisma.role.findFirst({
    where: { name: 'Tanent Owner', isSystemRole: true }
  });
  console.log(JSON.stringify(role, null, 2));
}

run().finally(() => prisma.$disconnect());
