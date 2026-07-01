const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  await prisma.userProfile.upsert({
    where: { userId: '5ee69aeb-d277-4e6c-9b35-8569461aac34' },
    update: {},
    create: {
      userId: '5ee69aeb-d277-4e6c-9b35-8569461aac34',
      companyName: 'Enfycon',
    }
  });
  console.log("Upserted user profile for Sambit");
}
main().finally(() => prisma.$disconnect());
