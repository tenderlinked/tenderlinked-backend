const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const roles = await prisma.role.findMany({ where: { isSystemRole: true } });
  
  for (const role of roles) {
    if (role.permissions.includes('*')) continue;
    
    const updatedPermissions = role.permissions.filter(p => p !== 'tenders:write' && p !== 'tenders:delete');
    
    if (updatedPermissions.length !== role.permissions.length) {
      await prisma.role.update({
        where: { id: role.id },
        data: { permissions: updatedPermissions }
      });
      console.log(`Updated permissions for ${role.name}`);
    }
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
