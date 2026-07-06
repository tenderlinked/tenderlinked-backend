const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const roles = await prisma.role.findMany();
  let updatedCount = 0;
  
  for (const role of roles) {
    if (role.permissions) {
      const newPerms = role.permissions.map(p => {
        if (p === 'users:read') return 'members:read';
        if (p === 'users:manage') return 'members:manage';
        return p;
      });
      
      // Check if they are different
      if (JSON.stringify(newPerms) !== JSON.stringify(role.permissions)) {
        await prisma.role.update({
          where: { id: role.id },
          data: { permissions: newPerms }
        });
        updatedCount++;
      }
    }
  }
  
  console.log(`Updated ${updatedCount} roles to use 'members' instead of 'users'`);
}

run().finally(() => prisma.$disconnect());
