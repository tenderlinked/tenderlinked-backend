const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const user = await prisma.userProfile.findUnique({ where: { email: 'akash@gmail.com' } });
  
  if (user) {
    // Find the default Member role
    const defaultMemberRole = await prisma.role.findFirst({
      where: { name: 'Member', isSystemRole: true }
    });

    if (defaultMemberRole) {
      await prisma.tenantMember.updateMany({
        where: { userId: user.userId },
        data: { roleId: defaultMemberRole.id }
      });
      console.log(`Reassigned akash@gmail.com to standard ${defaultMemberRole.name} role!`);
    } else {
      console.log("Could not find default Member role.");
    }
  } else {
    console.log("akash@gmail.com not found.");
  }
}
run().finally(() => prisma.$disconnect());
