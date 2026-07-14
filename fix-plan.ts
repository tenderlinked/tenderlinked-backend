import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const plan = await prisma.pricingPlan.findUnique({ where: { name: 'Starter' } }) || await prisma.pricingPlan.findFirst({ where: { name: { contains: 'Starter', mode: 'insensitive' } } });
  if (plan) {
    await prisma.tenantSubscription.updateMany({
      where: { planType: 'AA4D3794-666F-4F38-9929-DA7D943FABB7' },
      data: { planType: plan.name.toUpperCase(), availableCredits: plan.monthlyCredits }
    });
    console.log('Fixed subscriptions!');
  } else {
    console.log('Starter plan not found');
  }
}
main();
