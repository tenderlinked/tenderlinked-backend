import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const members = await prisma.tenantMember.findMany({
    include: { tenant: { include: { subscription: true } } }
  });
  console.log(JSON.stringify(members, null, 2));
}
main();
