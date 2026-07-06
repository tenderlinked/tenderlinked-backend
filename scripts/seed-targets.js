const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const DISTRICTS = ["angul","balangir","bargarh","deogarh","dhenkanal","gajapati","jharsuguda","kendrapada","keonjhar","koraput","malkangiri","nayagarh","nuapada","rayagada","subarnapur","sundargarh","cuttack","baleswar","bhadrak","bouda","cuttack","gajapati","jajpur","kalahandi","kandhamal","kendrapara","khordha","mayurbhanj","nabarangpur","puri"];
async function seed() {
  await prisma.scraperTarget.create({
    data: { name: "Odisha State Level", type: "STATE", url: "https://tendersodisha.gov.in", isActive: true }
  });
  for (const d of [...new Set(DISTRICTS)]) {
    await prisma.scraperTarget.create({
      data: { name: d.charAt(0).toUpperCase() + d.slice(1) + " District", type: "DISTRICT", url: "https://" + d + ".odisha.gov.in/en/tender", isActive: true }
    });
  }
  console.log("Seeded targets");
}
seed().finally(() => prisma.$disconnect());
