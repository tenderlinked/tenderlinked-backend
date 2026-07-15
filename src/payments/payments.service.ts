import { Injectable, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import Razorpay from 'razorpay';
import * as crypto from 'crypto';

@Injectable()
export class PaymentsService {
  private razorpay: any;

  constructor(private prisma: PrismaService) {
    if (!process.env.LIVE_API_KEY || !process.env.LIVE_SECRET_KEY) {
      console.warn("Razorpay keys not configured. Payments will fail.");
    } else {
      this.razorpay = new Razorpay({
        key_id: process.env.LIVE_API_KEY,
        key_secret: process.env.LIVE_SECRET_KEY,
      });
    }
  }

  // -------------------------------------------------------------
  // HELPER: Multi-Tenant Mapping
  // -------------------------------------------------------------
  private async getOrCreateUserTenant(userId: string) {
    let member = await this.prisma.tenantMember.findFirst({
      where: { userId },
      include: { tenant: true }
    });
    
    if (!member) {
      await this.prisma.userProfile.upsert({
        where: { userId },
        update: {},
        create: { userId }
      });

      const tenant = await this.prisma.tenant.create({
        data: {
          name: `Workspace_${userId.substring(0, 5)}`
        }
      });
      
      member = await this.prisma.tenantMember.create({
        data: {
          userId,
          tenantId: tenant.id,
          role: "OWNER"
        },
        include: { tenant: true }
      });
    }
    
    return member.tenant;
  }

  // -------------------------------------------------------------

  async createOrder(userId: string, planType: string, amount: number) {
    if (!this.razorpay) throw new InternalServerErrorException("Razorpay not configured");
    
    try {
      const orderOptions = {
        amount: amount * 100, // Razorpay uses paisa
        currency: "INR",
        receipt: `rcpt_${userId.substring(0, 8)}_${Date.now()}`,
        notes: {
          userId,
          planType
        }
      };
      
      const order = await this.razorpay.orders.create(orderOptions);
      return {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency
      };
    } catch (e) {
      console.error("Razorpay order error", e);
      throw new InternalServerErrorException("Failed to create Razorpay order");
    }
  }

  async verifyPayment(
    razorpayOrderId: string, 
    razorpayPaymentId: string, 
    razorpaySignature: string,
    userId: string,
    planType: string,
    amount: number
  ) {
    if (!process.env.LIVE_SECRET_KEY) throw new InternalServerErrorException("Razorpay secret not configured");

    const text = razorpayOrderId + "|" + razorpayPaymentId;
    const generatedSignature = crypto
      .createHmac("sha256", process.env.LIVE_SECRET_KEY)
      .update(text)
      .digest("hex");

    if (generatedSignature !== razorpaySignature) {
      throw new BadRequestException("Invalid payment signature");
    }

    const { eligible } = await this.checkTrialEligibility(userId);

    await this.createSubscriptionAfterSuccess(
      userId,
      planType,
      "RAZORPAY",
      razorpayPaymentId,
      amount,
      eligible
    );

    return { success: true };
  }

  async checkTrialEligibility(userId: string) {
    const tenant = await this.getOrCreateUserTenant(userId);
    const existing = await this.prisma.tenantSubscription.findFirst({
      where: { 
        tenantId: tenant.id,
        NOT: {
          planType: {
            equals: "Free",
            mode: "insensitive"
          }
        }
      }
    });
    return { eligible: !existing };
  }

  async createSubscriptionAfterSuccess(
    userId: string,
    planIdOrName: string,
    paymentMethod: string,
    paymentId: string,
    amount: number,
    isTrial: boolean = false
  ) {
    // Attempt to resolve planIdOrName against the PricingPlan table
    let plan = await this.prisma.pricingPlan.findUnique({
      where: { id: planIdOrName }
    }).catch(() => null);

    if (!plan) {
      plan = await this.prisma.pricingPlan.findUnique({
        where: { name: planIdOrName }
      }).catch(() => null);
    }

    const actualPlanName = plan ? plan.name : planIdOrName;
    const normalizedPlan = actualPlanName.toLowerCase();

    const startDate = new Date();
    let endDate = new Date();

    if (isTrial) {
      endDate.setDate(endDate.getDate() + 14);
    } else {
      if (normalizedPlan === "monthly") {
        endDate.setMonth(endDate.getMonth() + 1);
      } else if (normalizedPlan === "yearly") {
        endDate.setFullYear(endDate.getFullYear() + 1);
      } else {
        endDate.setDate(endDate.getDate() + 30);
      }
    }

    const tenant = await this.getOrCreateUserTenant(userId);
    let credits = plan ? plan.monthlyCredits : 0;

    // Check for active subscription to compute prorated upgrade/downgrade duration
    const existingSub = await this.prisma.tenantSubscription.findUnique({
      where: { tenantId: tenant.id }
    });

    if (existingSub && existingSub.status === "ACTIVE" && existingSub.planType !== actualPlanName) {
      // Preserve existing credits
      credits = existingSub.availableCredits;

      const now = new Date();
      if (existingSub.endDate > now) {
        const timeDiff = existingSub.endDate.getTime() - now.getTime();
        const remainingDays = timeDiff / (1000 * 60 * 60 * 24);

        // Fetch old plan pricing details
        const oldPlan = await this.prisma.pricingPlan.findFirst({
          where: {
            OR: [
              { name: existingSub.planType },
              { id: existingSub.planType }
            ]
          }
        }).catch(() => null);

        const oldPrice = oldPlan ? oldPlan.price : (existingSub.amount || 0);
        const newPrice = plan ? plan.price : amount;

        if (oldPrice && oldPrice > 0 && newPrice && newPrice > 0) {
          const proratedDays = remainingDays * (oldPrice / newPrice);
          // Add the prorated credit days to the already calculated base endDate (which has the 30-day or 1-month fresh cycle)
          endDate.setDate(endDate.getDate() + Math.round(proratedDays));
          
          console.log(`[Proration] Adjusted subscription for user ${userId}: plan changed from ${existingSub.planType} (₹${oldPrice}) to ${actualPlanName} (₹${newPrice}). Prorated credit of ${proratedDays.toFixed(1)} days added. Final endDate: ${endDate}.`);
        }
      }
    }

    const finalAmount = (plan && plan.price !== null) ? plan.price : amount;

    await this.prisma.tenantSubscription.upsert({
      where: { tenantId: tenant.id },
      update: {
        planType: actualPlanName,
        status: "ACTIVE",
        startDate,
        endDate,
        paymentMethod,
        paymentId,
        amount: finalAmount,
        availableCredits: credits
      },
      create: {
        tenantId: tenant.id,
        planType: actualPlanName,
        status: "ACTIVE",
        startDate,
        endDate,
        paymentMethod,
        paymentId,
        amount: finalAmount,
        availableCredits: credits
      }
    });
  }

  async createSubscription(userId: string, planIdOrName: string) {
    if (!this.razorpay) throw new InternalServerErrorException("Razorpay not configured");

    const { eligible } = await this.checkTrialEligibility(userId);

    // Attempt to resolve planIdOrName against the PricingPlan table
    let plan = await this.prisma.pricingPlan.findUnique({
      where: { id: planIdOrName }
    }).catch(() => null);

    if (!plan) {
      plan = await this.prisma.pricingPlan.findUnique({
        where: { name: planIdOrName }
      }).catch(() => null);
    }

    const actualPlanName = plan ? plan.name : planIdOrName;
    const normalizedPlan = actualPlanName.toLowerCase();

    let planId = "";
    if (plan && plan.price && plan.price > 0) {
      planId = await this.getOrCreateRazorpayPlan(actualPlanName, plan.price);
    } else {
      throw new BadRequestException(`Cannot create subscription for a free or unpriced plan`);
    }
    
    let startAt: number | undefined = undefined;
    if (eligible && (
      normalizedPlan === "starter" || 
      normalizedPlan === "standard" || 
      normalizedPlan === "premium" || 
      normalizedPlan === "basic" || 
      normalizedPlan === "professional" || 
      normalizedPlan === "enterprise"
    )) {
      startAt = Math.floor(Date.now() / 1000) + (14 * 24 * 60 * 60);
    }

    if (!planId) throw new BadRequestException(`Plan ID not configured for ${actualPlanName}`);

    try {
      const options: any = {
        plan_id: planId,
        customer_notify: 1,
        total_count: 120,
        notes: {
          userId,
          planType: actualPlanName
        }
      };

      if (startAt) {
        options.start_at = startAt;
      }
      
      const subscription = await this.razorpay.subscriptions.create(options);
      return {
        subscriptionId: subscription.id,
      };
    } catch (e) {
      console.error("Razorpay subscription error", e);
      throw new InternalServerErrorException("Failed to create Razorpay subscription");
    }
  }

  async verifySubscription(
    razorpayPaymentId: string, 
    razorpaySubscriptionId: string, 
    razorpaySignature: string,
    userId: string,
    planType: string,
    amount: number
  ) {
    if (!process.env.LIVE_SECRET_KEY) throw new InternalServerErrorException("Razorpay secret not configured");

    const text = razorpayPaymentId + "|" + razorpaySubscriptionId;
    const generatedSignature = crypto
      .createHmac("sha256", process.env.LIVE_SECRET_KEY)
      .update(text)
      .digest("hex");

    if (generatedSignature !== razorpaySignature) {
      throw new BadRequestException("Invalid payment signature");
    }

    const { eligible } = await this.checkTrialEligibility(userId);

    await this.createSubscriptionAfterSuccess(
      userId,
      planType,
      "RAZORPAY_SUB",
      razorpaySubscriptionId,
      amount,
      eligible
    );

    return { success: true };
  }

  async handleWebhook(body: any, signature: string) {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.LIVE_SECRET_KEY;
    
    if (!webhookSecret) {
      throw new InternalServerErrorException("Webhook secret not configured");
    }

    const generatedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(JSON.stringify(body))
      .digest("hex");

    if (generatedSignature !== signature) {
      throw new BadRequestException("Invalid webhook signature");
    }

    const event = body.event;
    
    if (event === "subscription.charged") {
      const subscription = body.payload.subscription.entity;
      const payment = body.payload.payment.entity;
      
      const userId = subscription.notes?.userId;
      const planType = subscription.notes?.planType;

      if (userId && planType) {
        await this.createSubscriptionAfterSuccess(
          userId,
          planType,
          "RAZORPAY_SUB",
          subscription.id,
          payment.amount / 100
        );
      }
    } else if (event === "subscription.halted" || event === "subscription.cancelled") {
       const subscription = body.payload.subscription.entity;
       const userId = subscription.notes?.userId;
       if (userId) {
          const tenant = await this.getOrCreateUserTenant(userId);
          await this.prisma.tenantSubscription.updateMany({
             where: { tenantId: tenant.id, paymentId: subscription.id },
             data: { status: "INACTIVE" }
          });
       }
    }

    return { received: true };
  }

  async cancelSubscription(userId: string) {
    if (!this.razorpay) throw new InternalServerErrorException("Razorpay not configured");

    const tenant = await this.getOrCreateUserTenant(userId);
    const subscription = await this.prisma.tenantSubscription.findUnique({
      where: { tenantId: tenant.id }
    });

    if (!subscription || !subscription.paymentId || subscription.status !== "ACTIVE") {
      throw new BadRequestException("No active subscription found for this user/tenant");
    }

    try {
      if (subscription.paymentMethod === "RAZORPAY_SUB") {
        try {
          await this.razorpay.subscriptions.cancel(subscription.paymentId, false);
        } catch (err: any) {
          const errMsg = (err.error?.description || err.message || "").toLowerCase();
          if (errMsg.includes("cancelled status") || errMsg.includes("already cancelled")) {
            console.log("Subscription already cancelled in Razorpay.");
          } else {
            console.warn("Immediate cancel failed:", err.error || err);
            throw err;
          }
        }
      }

      await this.prisma.tenantSubscription.update({
        where: { tenantId: tenant.id },
        data: { status: "CANCELLED" }
      });

      return { success: true, status: "CANCELLED" };
    } catch (e) {
      console.error("Failed to cancel subscription", e);
      throw new InternalServerErrorException("Failed to cancel subscription");
    }
  }

  async cancelAndUpgrade(userId: string, planIdOrName: string) {
    if (!this.razorpay) throw new InternalServerErrorException("Razorpay not configured");

    const tenant = await this.getOrCreateUserTenant(userId);
    const existingSub = await this.prisma.tenantSubscription.findUnique({
      where: { tenantId: tenant.id }
    });

    if (!existingSub || existingSub.status !== "ACTIVE") {
      throw new BadRequestException("No active subscription found to upgrade");
    }

    // Step 1: Cancel the existing Razorpay subscription
    if (existingSub.paymentId && existingSub.paymentMethod === "RAZORPAY_SUB") {
      try {
        await this.razorpay.subscriptions.cancel(existingSub.paymentId, false);
        console.log(`[Upgrade] Cancelled existing Razorpay subscription ${existingSub.paymentId} for user ${userId}`);
      } catch (err: any) {
        const msg = (err.error?.description || err.message || "").toLowerCase();
        if (!msg.includes("cancelled") && !msg.includes("already cancelled")) {
          console.warn("Failed to cancel existing subscription on Razorpay:", err.error || err);
          // Continue anyway — we still create the new subscription
        }
      }
    }

    // Step 2: Resolve the new plan and its Razorpay plan ID
    let plan = await this.prisma.pricingPlan.findUnique({ where: { id: planIdOrName } }).catch(() => null);
    if (!plan) {
      plan = await this.prisma.pricingPlan.findUnique({ where: { name: planIdOrName } }).catch(() => null);
    }
    if (!plan) throw new BadRequestException("Selected plan not found");

    if (!plan.price || plan.price <= 0) {
      throw new BadRequestException("Cannot upgrade to a free plan via subscription");
    }
    
    const razorpayPlanId = await this.getOrCreateRazorpayPlan(plan.name, plan.price);

    // Step 3: Calculate prorated next billing date
    // remaining monetary value on old plan ÷ new daily rate → new remaining days
    const now = new Date();
    const oldPrice = Number(existingSub.amount ?? 0);
    const newPrice = Number(plan.price ?? 0);
    const remainingMs = existingSub.endDate.getTime() - now.getTime();
    const remainingDays = Math.max(0, remainingMs / (1000 * 60 * 60 * 24));

    let startAt: number | undefined = undefined;
    let proratedDays = remainingDays;

    if (oldPrice > 0 && newPrice > 0 && remainingDays > 0) {
      proratedDays = remainingDays * (oldPrice / newPrice);
      const proratedDate = new Date();
      proratedDate.setDate(proratedDate.getDate() + Math.max(1, Math.round(proratedDays)));
      // start_at must be a Unix timestamp in seconds
      startAt = Math.floor(proratedDate.getTime() / 1000);
      console.log(`[Upgrade] Prorated next billing: ${existingSub.planType} (₹${oldPrice}) → ${plan.name} (₹${newPrice}). Remaining ${remainingDays.toFixed(1)} days → ${proratedDays.toFixed(1)} days. start_at: ${proratedDate}`);
    }

    // Step 4: Create new Razorpay subscription with deferred start date
    // Razorpay will only collect the ₹5 mandate auth fee now; first real charge on start_at date
    try {
      const options: any = {
        plan_id: razorpayPlanId,
        customer_notify: 1,
        total_count: 120,
        notes: { userId, planType: plan.name, upgradeFrom: existingSub.planType }
      };
      if (startAt) {
        options.start_at = startAt;
      }

      const subscription = await this.razorpay.subscriptions.create(options);
      console.log(`[Upgrade] Created new Razorpay subscription ${subscription.id} for user ${userId}: ${existingSub.planType} → ${plan.name}`);
      return {
        subscriptionId: subscription.id,
        proratedDays: Math.max(1, Math.round(proratedDays))
      };
    } catch (e) {
      console.error("Failed to create new Razorpay subscription for upgrade", e);
      throw new InternalServerErrorException("Failed to create upgrade subscription");
    }
  }

  async changePlanDirectly(userId: string, planIdOrName: string) {
    const tenant = await this.getOrCreateUserTenant(userId);
    const existingSub = await this.prisma.tenantSubscription.findUnique({
      where: { tenantId: tenant.id }
    });

    if (!existingSub || existingSub.status !== "ACTIVE") {
      throw new BadRequestException("No active subscription found to modify");
    }

    // Resolve pricing plan
    let plan = await this.prisma.pricingPlan.findUnique({
      where: { id: planIdOrName }
    }).catch(() => null);

    if (!plan) {
      plan = await this.prisma.pricingPlan.findUnique({
        where: { name: planIdOrName }
      }).catch(() => null);
    }

    if (!plan) {
      throw new BadRequestException("Selected plan not found");
    }

    const actualPlanName = plan.name;
    const now = new Date();
    const remainingTime = existingSub.endDate.getTime() - now.getTime();
    const remainingDays = Math.max(0, remainingTime / (1000 * 60 * 60 * 24));

    const oldPrice = Number(existingSub.amount ?? 0);
    const newPrice = Number(plan.price ?? 0);

    let nextBillingDate: Date;

    if (oldPrice > 0 && newPrice > 0 && remainingDays > 0) {
      // Prorate remaining monetary value into days of the new plan:
      // Upgrading → fewer days (earlier end date)
      // Downgrading → more days (later end date)
      const newRemainingDays = remainingDays * (oldPrice / newPrice);
      nextBillingDate = new Date();
      nextBillingDate.setDate(nextBillingDate.getDate() + Math.max(1, Math.round(newRemainingDays)));
      console.log(`[Plan Change] User ${userId}: ${existingSub.planType} (₹${oldPrice}) → ${actualPlanName} (₹${newPrice}). Remaining days: ${remainingDays.toFixed(1)} → ${newRemainingDays.toFixed(1)}. New billing date: ${nextBillingDate}`);
    } else {
      // Fallback: keep existing end date
      nextBillingDate = new Date(existingSub.endDate);
    }

    // Update in Razorpay if needed
    if (existingSub.paymentId && existingSub.paymentMethod === "RAZORPAY_SUB") {
      try {
        let newPlanId = "";
        if (plan.price && plan.price > 0) {
          newPlanId = await this.getOrCreateRazorpayPlan(plan.name, plan.price);
        }

        if (newPlanId && this.razorpay) {
          await this.razorpay.subscriptions.update(existingSub.paymentId, {
            plan_id: newPlanId
          });
        }
      } catch (err) {
        console.warn("Failed to update Razorpay subscription plan", err);
      }
    }

    // Update local database — keep endDate, just swap plan type and amount
    const updatedSub = await this.prisma.tenantSubscription.update({
      where: { tenantId: tenant.id },
      data: {
        planType: actualPlanName,
        amount: plan.price,
        endDate: nextBillingDate,
        // availableCredits is preserved as is
      }
    });

    return {
      success: true,
      planType: updatedSub.planType,
      amount: updatedSub.amount,
      endDate: updatedSub.endDate
    };
  }

  private async getOrCreateRazorpayPlan(planName: string, price: number): Promise<string> {
    if (!this.razorpay) throw new InternalServerErrorException("Razorpay not configured");
    if (!price || price <= 0) throw new BadRequestException("Plan price must be greater than 0");
    const amountInPaise = Math.round(price * 118); // 18% GST

    try {
      const plans = await this.razorpay.plans.all();
      const existingPlan = plans.items.find((p: any) => p.item.name === planName && p.item.amount === amountInPaise && p.period === 'monthly');
      if (existingPlan) return existingPlan.id;

      const newPlan = await this.razorpay.plans.create({
        period: 'monthly',
        interval: 1,
        item: {
          name: planName,
          amount: amountInPaise,
          currency: 'INR',
          description: `TenderLinked ${planName} Plan`
        }
      });
      return newPlan.id;
    } catch (e) {
      console.error("Failed to resolve or create Razorpay Plan", e);
      throw new InternalServerErrorException("Failed to prepare subscription plan");
    }
  }
}
