const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function fix() {
  await prisma.scraperTarget.deleteMany({ where: { name: 'Kendrapada District' } });
  
  const missing = ['ganjam', 'jagatsinghpur', 'sambalpur'];
  for (const d of missing) {
    await prisma.scraperTarget.create({
      data: { name: d.charAt(0).toUpperCase() + d.slice(1) + ' District', type: 'DISTRICT', url: 'https://' + d + '.odisha.gov.in/en/tender', isActive: true, state: 'Odisha' }
    });
  }
  console.log('Fixed districts');
}
fix().finally(() => prisma.$disconnect());
