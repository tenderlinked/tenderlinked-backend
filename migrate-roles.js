const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();

async function runMigration() {
  console.log("Starting role migration...");
  
  // 1. Create System Roles
  const roles = [
    { name: 'Workspace Owner', description: 'Absolute full access', permissions: ['*'], isSystemRole: true },
    { name: 'Admin', description: 'Can manage all resources except billing and workspace deletion', permissions: ['tenders:read', 'tenders:export', 'users:read', 'users:manage', 'settings:manage'], isSystemRole: true },
    { name: 'Member', description: 'Standard access', permissions: ['tenders:read', 'tenders:export', 'users:read'], isSystemRole: true },
  ];

  const createdRoles = {};
  for (const r of roles) {
    const existing = await prisma.role.findFirst({ where: { name: r.name, isSystemRole: true } });
    if (!existing) {
      createdRoles[r.name] = await prisma.role.create({ data: r });
      console.log(`Created system role: ${r.name}`);
    } else {
      createdRoles[r.name] = existing;
    }
  }

  // 2. Migrate existing TenantMembers
  const members = await prisma.tenantMember.findMany();
  let updatedCount = 0;
  for (const m of members) {
    if (m.roleId) continue; // Already migrated
    
    let roleToAssign = createdRoles['Member'].id;
    let isOwner = false;
    
    if (m.role === 'OWNER') {
      roleToAssign = createdRoles['Workspace Owner'].id;
      isOwner = true;
    } else if (m.role === 'ADMIN') {
      roleToAssign = createdRoles['Admin'].id;
    }

    await prisma.tenantMember.update({
      where: { id: m.id },
      data: { roleId: roleToAssign, isOwner }
    });
    updatedCount++;
  }
  
  console.log(`Migrated ${updatedCount} existing tenant members.`);
  console.log("Migration complete!");
}

runMigration()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
