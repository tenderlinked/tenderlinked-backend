const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const user = await prisma.userProfile.findUnique({ where: { email: 'akash@gmail.com' } });
  if (user) {
    await prisma.tenantMember.updateMany({
      where: { userId: user.userId },
      data: { roleId: '4ae3d402-3ed7-4357-952a-a2bfc334991f' }
    });
    console.log("Updated akash to Tanent Member!");
  }
}
run().finally(() => prisma.$disconnect());
