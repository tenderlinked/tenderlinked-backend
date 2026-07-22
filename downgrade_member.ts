import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = 'imsahadeb@gmail.com';
  
  const profile = await prisma.userProfile.findUnique({
    where: { email },
  });
  
  if (profile) {
    const member = await prisma.tenantMember.updateMany({
      where: { userId: profile.userId },
      data: { role: 'MEMBER' }
    });
    console.log(`Successfully updated ${email} to Tenant Member role (from Owner).`);
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
