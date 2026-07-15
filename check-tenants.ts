import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const tenants = await prisma.tenant.findMany({ include: { subscription: true } });
  console.log(JSON.stringify(tenants, null, 2));
}
main();
