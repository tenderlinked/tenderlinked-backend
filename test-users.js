const fetch = require('node-fetch'); // wait, node 18 has fetch

async function run() {
  // Let's just query the database directly using Prisma if we are in the backend directory
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  const users = await prisma.user.findMany({ select: { email: true, passwordHash: true } });
  console.log(users);
}
run();
