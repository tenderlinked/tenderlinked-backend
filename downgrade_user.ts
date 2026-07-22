import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = 'imsahadeb@gmail.com';
  
  const profile = await prisma.userProfile.update({
    where: { email },
    data: { globalRole: 'USER' }
  });
  
  console.log(`Successfully updated ${email} to globalRole: ${profile.globalRole}`);
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
