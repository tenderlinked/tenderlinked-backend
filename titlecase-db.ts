const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function toTitleCase(str) {
  if (!str) return str;
  return str.replace(/\w\S*/g, function(txt) {
    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
  });
}

async function run() {
  console.log("Fetching tenders to title-case...");
  const tenders = await prisma.tender.findMany({
    select: { id: true, organisation: true, city: true, district: true }
  });

  let updatedCount = 0;
  for (const t of tenders) {
    let changed = false;
    const data: { organisation?: string; city?: string; district?: string } = {};

    if (t.organisation && t.organisation !== toTitleCase(t.organisation)) {
      data.organisation = toTitleCase(t.organisation);
      changed = true;
    }
    if (t.city && t.city !== toTitleCase(t.city)) {
      data.city = toTitleCase(t.city);
      changed = true;
    }
    if (t.district && t.district !== toTitleCase(t.district)) {
      data.district = toTitleCase(t.district);
      changed = true;
    }

    if (changed) {
      await prisma.tender.update({
        where: { id: t.id },
        data
      });
      updatedCount++;
    }
  }

  console.log(`Successfully title-cased ${updatedCount} tenders.`);
}

run().finally(() => prisma.$disconnect());
