import { PrismaClient } from '@prisma/client';
import { PrismaService } from './src/prisma/prisma.service';
import { scrapeStateTenders } from './src/scraper/nicgep-scraper';
import { SessionService } from './src/scraper/session.service';

const prisma = new PrismaClient() as unknown as PrismaService;
const sessionService = new SessionService();

async function test() {
  console.log("Starting scrape test...");
  await scrapeStateTenders(
    prisma,
    sessionService,
    { name: "Odisha", url: "https://tendersodisha.gov.in/nicgep/app?page=FrontEndTendersByOrganisation&service=page" },
    "TEST",
    () => 'RUNNING',
    (found, added) => {
       console.log(`Progress: found ${found}, added ${added}`);
    }
  );
  console.log("Done!");
}

test().catch(console.error).finally(() => prisma.$disconnect());
