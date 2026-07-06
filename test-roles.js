const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const roles = await prisma.role.findMany();
  console.log("System Roles:", JSON.stringify(roles, null, 2));
}

run().finally(() => prisma.$disconnect());
