const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const logs = await prisma.scrapeLog.findMany({ orderBy: { createdAt: 'desc' }, take: 5 });
  console.log(logs);
}
main().finally(() => process.exit(0));
