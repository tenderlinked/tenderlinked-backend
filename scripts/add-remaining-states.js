const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const REMAINING_STATES = [
  { name: 'Andhra Pradesh State Level', type: 'STATE', url: 'https://apeprocurement.gov.in', state: 'Andhra Pradesh' },
  { name: 'Arunachal Pradesh State Level', type: 'STATE', url: 'https://arunachaltenders.gov.in', state: 'Arunachal Pradesh' },
  { name: 'Chhattisgarh State Level', type: 'STATE', url: 'https://eproc.cgstate.gov.in', state: 'Chhattisgarh' },
  { name: 'Goa State Level', type: 'STATE', url: 'https://eprocure.goa.gov.in', state: 'Goa' },
  { name: 'Gujarat State Level', type: 'STATE', url: 'https://tender.nprocure.com', state: 'Gujarat' },
  { name: 'Himachal Pradesh State Level', type: 'STATE', url: 'https://hptenders.gov.in', state: 'Himachal Pradesh' },
  { name: 'Karnataka State Level', type: 'STATE', url: 'https://eproc.karnataka.gov.in', state: 'Karnataka' },
  { name: 'Madhya Pradesh State Level', type: 'STATE', url: 'https://mptenders.gov.in', state: 'Madhya Pradesh' },
  { name: 'Manipur State Level', type: 'STATE', url: 'https://manipurtenders.gov.in', state: 'Manipur' },
  { name: 'Meghalaya State Level', type: 'STATE', url: 'https://meghalayatenders.gov.in', state: 'Meghalaya' },
  { name: 'Mizoram State Level', type: 'STATE', url: 'https://mizoramtenders.gov.in', state: 'Mizoram' },
  { name: 'Nagaland State Level', type: 'STATE', url: 'https://nagalandtenders.gov.in', state: 'Nagaland' },
  { name: 'Rajasthan State Level', type: 'STATE', url: 'https://eproc.rajasthan.gov.in', state: 'Rajasthan' },
  { name: 'Sikkim State Level', type: 'STATE', url: 'https://sikkimtenders.gov.in', state: 'Sikkim' },
  { name: 'Telangana State Level', type: 'STATE', url: 'https://tender.telangana.gov.in', state: 'Telangana' },
  { name: 'Tripura State Level', type: 'STATE', url: 'https://tripuratenders.gov.in', state: 'Tripura' },
  { name: 'Uttarakhand State Level', type: 'STATE', url: 'https://uktenders.gov.in', state: 'Uttarakhand' },
  { name: 'Andaman and Nicobar State Level', type: 'STATE', url: 'https://eprocure.andaman.gov.in', state: 'Andaman and Nicobar' },
  { name: 'Chandigarh State Level', type: 'STATE', url: 'https://etenders.chd.nic.in', state: 'Chandigarh' },
  { name: 'Dadra and Nagar Haveli State Level', type: 'STATE', url: 'https://ddtenders.gov.in', state: 'Dadra and Nagar Haveli' },
  { name: 'Delhi State Level', type: 'STATE', url: 'https://etenders.delhi.gov.in', state: 'Delhi' },
  { name: 'Jammu and Kashmir State Level', type: 'STATE', url: 'https://jktenders.gov.in', state: 'Jammu and Kashmir' },
  { name: 'Ladakh State Level', type: 'STATE', url: 'https://tenders.ladakh.gov.in', state: 'Ladakh' },
  { name: 'Lakshadweep State Level', type: 'STATE', url: 'https://lakshadweeptenders.gov.in', state: 'Lakshadweep' },
  { name: 'Puducherry State Level', type: 'STATE', url: 'https://pudutenders.gov.in', state: 'Puducherry' }
];

async function seedStates() {
  for (const s of REMAINING_STATES) {
    const exists = await prisma.scraperTarget.findFirst({ where: { url: s.url } });
    if (!exists) {
      await prisma.scraperTarget.create({
        data: { name: s.name, type: s.type, url: s.url, isActive: true, state: s.state }
      });
    }
  }
  console.log(`Added ${REMAINING_STATES.length} remaining states and UTs.`);
}

seedStates().finally(() => prisma.$disconnect());
