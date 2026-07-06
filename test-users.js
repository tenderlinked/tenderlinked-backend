const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const users = await prisma.userProfile.findMany();
  console.log(JSON.stringify(users, null, 2));
}
run().finally(() => prisma.$disconnect());
