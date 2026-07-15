import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const plans = await prisma.pricingPlan.findMany();
  const subscriptions = await prisma.tenantSubscription.findMany();
  
  for (const sub of subscriptions) {
    const matchingPlan = plans.find(p => p.name.toUpperCase() === sub.planType.toUpperCase() || p.id === sub.planType);
    if (matchingPlan) {
      const updateData: any = {};
      if (sub.planType !== matchingPlan.name) {
        updateData.planType = matchingPlan.name;
      }
      if (sub.status === "ACTIVE" && sub.availableCredits === 0) {
        updateData.availableCredits = matchingPlan.monthlyCredits;
      }
      if (sub.status === "ACTIVE" && (sub.amount === 5 || sub.amount === null)) {
        updateData.amount = matchingPlan.price;
      }
      
      if (Object.keys(updateData).length > 0) {
        await prisma.tenantSubscription.update({
          where: { id: sub.id },
          data: updateData
        });
        console.log(`Updated sub ${sub.id} with:`, updateData);
      }
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
