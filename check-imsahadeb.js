const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const user = await prisma.userProfile.findUnique({ where: { email: 'imsahadeb@gmail.com' } });
  if (user) {
    const member = await prisma.tenantMember.findFirst({
      where: { userId: user.userId },
      include: { customRole: true }
    });
    console.log(JSON.stringify(member, null, 2));
  }
}

run().finally(() => prisma.$disconnect());
