const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const OTHER_STATES = [
  { name: 'Maharashtra State Level', type: 'STATE', url: 'https://mahatenders.gov.in', state: 'Maharashtra' },
  { name: 'Uttar Pradesh State Level', type: 'STATE', url: 'https://etender.up.nic.in', state: 'Uttar Pradesh' },
  { name: 'West Bengal State Level', type: 'STATE', url: 'https://wbtenders.gov.in', state: 'West Bengal' },
  { name: 'Kerala State Level', type: 'STATE', url: 'https://etenders.kerala.gov.in', state: 'Kerala' },
  { name: 'Tamil Nadu State Level', type: 'STATE', url: 'https://tntenders.gov.in', state: 'Tamil Nadu' },
  { name: 'Punjab State Level', type: 'STATE', url: 'https://eproc.punjab.gov.in', state: 'Punjab' },
  { name: 'Haryana State Level', type: 'STATE', url: 'https://etenders.hry.nic.in', state: 'Haryana' },
  { name: 'Assam State Level', type: 'STATE', url: 'https://assamtenders.gov.in', state: 'Assam' },
  { name: 'Bihar State Level', type: 'STATE', url: 'https://eproc2.bihar.gov.in', state: 'Bihar' },
  { name: 'Jharkhand State Level', type: 'STATE', url: 'https://jharkhandtenders.gov.in', state: 'Jharkhand' }
];

async function seedStates() {
  for (const s of OTHER_STATES) {
    // Check if it already exists
    const exists = await prisma.scraperTarget.findFirst({ where: { url: s.url } });
    if (!exists) {
      await prisma.scraperTarget.create({
        data: { name: s.name, type: s.type, url: s.url, isActive: true, state: s.state }
      });
    }
  }
  console.log('Added other states');
}

seedStates().finally(() => prisma.$disconnect());
