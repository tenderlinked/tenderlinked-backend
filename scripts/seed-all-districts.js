const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

const prisma = new PrismaClient();

async function seed() {
  const data = JSON.parse(fs.readFileSync('./states-and-districts.json', 'utf8'));
  let inserted = 0;

  for (const s of data.states) {
    const stateName = s.state;
    for (const district of s.districts) {
      const targetName = `${district} District`;
      
      const existing = await prisma.scraperTarget.findFirst({ 
        where: { name: targetName, state: stateName } 
      });
      
      if (!existing) {
        const formatted = district.toLowerCase().replace(/[^a-z0-9]/g, '');
        const url = `https://${formatted}.nic.in/en/tender`;
        await prisma.scraperTarget.create({
          data: {
            name: targetName,
            type: 'DISTRICT',
            state: stateName,
            url: url,
            isActive: true
          }
        });
        inserted++;
      }
    }
  }
  console.log(`Successfully added ${inserted} new districts across all states!`);
}

seed().finally(() => prisma.$disconnect());
