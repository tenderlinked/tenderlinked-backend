const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const result = await prisma.role.updateMany({
    where: { name: 'Tanent Owner', isSystemRole: true },
    data: { 
      permissions: [
        "tenders:read",
        "bookmarks:manage",
        "keywords:read",
        "keywords:manage",
        "alerts:manage",
        "members:read",
        "members:manage",
        "roles:manage",
        "billing:read",
        "billing:manage",
        "settings:manage",
        "users:read",
        "users:manage"
      ] 
    }
  });
  console.log(`Reverted Tanent Owner role to specific permissions`);
}

run().finally(() => prisma.$disconnect());
