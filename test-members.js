const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const members = await prisma.tenantMember.findMany({
    include: { customRole: true, tenant: true }
  });
  console.log(JSON.stringify(members, null, 2));
}
run().finally(() => prisma.$disconnect());
