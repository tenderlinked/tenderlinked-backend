import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const plans = await prisma.pricingPlan.findMany();
  const subscriptions = await prisma.tenantSubscription.findMany();
  
  for (const sub of subscriptions) {
    const matchingPlan = plans.find(p => p.name.toUpperCase() === sub.planType.toUpperCase() || p.id === sub.planType);
    if (matchingPlan && sub.planType !== matchingPlan.name) {
      await prisma.tenantSubscription.update({
        where: { id: sub.id },
        data: { planType: matchingPlan.name }
      });
      console.log(`Updated sub ${sub.id} planType from ${sub.planType} to ${matchingPlan.name}`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
