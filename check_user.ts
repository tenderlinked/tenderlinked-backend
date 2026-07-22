import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const profile = await prisma.userProfile.findUnique({
    where: { email: 'imsahadeb@gmail.com' },
  });
  console.log('User Profile:', profile);
  
  if (profile) {
      const member = await prisma.tenantMember.findFirst({
          where: { userId: profile.userId },
          include: { tenant: true, customRole: true }
      });
      console.log('Tenant Member:', member);
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
