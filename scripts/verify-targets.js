const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verifyUrls() {
  const targets = await prisma.scraperTarget.findMany({
    where: {
      type: 'DISTRICT',
      state: {
        not: 'Odisha' // Leave Odisha alone as they were verified earlier
      }
    }
  });

  console.log(`Starting verification of ${targets.length} district URLs...`);
  let invalidCount = 0;

  // Process in batches of 20
  for (let i = 0; i < targets.length; i += 20) {
    const batch = targets.slice(i, i + 20);
    const checks = batch.map(async (target) => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
        
        const response = await fetch(target.url, { 
          method: 'HEAD', 
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
          }
        });
        clearTimeout(timeoutId);
        
        if (!response.ok && response.status !== 405) { // 405 means method not allowed, which means server exists
          throw new Error(`HTTP ${response.status}`);
        }
        return { target, valid: true };
      } catch (err) {
        return { target, valid: false };
      }
    });

    const results = await Promise.all(checks);
    
    for (const res of results) {
      if (!res.valid) {
        await prisma.scraperTarget.delete({ where: { id: res.target.id } });
        invalidCount++;
      }
    }
    console.log(`Processed ${Math.min(i + 20, targets.length)}/${targets.length} ... (Removed ${invalidCount} so far)`);
  }

  console.log(`\nVerification complete. Removed ${invalidCount} inactive/broken district URLs.`);
}

verifyUrls().finally(() => prisma.$disconnect());
