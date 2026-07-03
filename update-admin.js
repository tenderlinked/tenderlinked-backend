const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const adminEmail = 'admin@enfycon.com';
  
  const updated = await prisma.userProfile.update({
    where: { email: adminEmail },
    data: { globalRole: 'SUPER_ADMIN' }
  });

  console.log('Updated user profile:', updated);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
