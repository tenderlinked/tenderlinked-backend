import Razorpay from 'razorpay';
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || '',
    key_secret: process.env.RAZORPAY_KEY_SECRET || ''
  });

  try {
    const plans = await razorpay.plans.all();
    console.log("Existing Razorpay Plans:");
    for (const p of plans.items) {
      console.log(`- ${p.id}: ${p.item.name} | Amount: ₹${Number(p.item.amount) / 100} | Interval: ${p.interval} ${p.period}`);
    }
  } catch (e) {
    console.error("Failed", e);
  }
}
main();
