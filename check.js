const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  console.log("Subscriptions:");
  console.log(await prisma.userSubscription.findMany());
  console.log("Profiles:");
  console.log(await prisma.userProfile.findMany());
}
main().finally(() => prisma.$disconnect());
