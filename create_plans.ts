import Razorpay from 'razorpay';
import * as dotenv from 'dotenv';
dotenv.config();

const razorpay = new Razorpay({
  key_id: process.env.LIVE_API_KEY || '',
  key_secret: process.env.LIVE_SECRET_KEY || '',
});

async function createPlans() {
  const plans = [
    { name: 'TenderLinked Basic (Entry Level)', amount: 294882 },
    { name: 'TenderLinked Professional (Growth)', amount: 766882 },
    { name: 'TenderLinked Enterprise (Scale)', amount: 1769882 }
  ];

  for (const p of plans) {
    try {
      const plan = await razorpay.plans.create({
        period: "monthly",
        interval: 1,
        item: {
          name: p.name,
          amount: p.amount,
          currency: "INR",
          description: "Monthly subscription"
        }
      });
      console.log(`Plan Created: ${p.name} -> ${plan.id}`);
    } catch (err: any) {
      console.error(`Failed to create ${p.name}:`, err.error || err);
    }
  }
}

createPlans();
