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
          name: `Workspace_${userId.substring(0, 5)}`,
          subdomain: `sub_${userId.substring(0, 5)}_${Date.now()}`
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
    const existing = await this.prisma.tenantSubscription.findUnique({
      where: { tenantId: tenant.id }
    });
    return { eligible: !existing };
  }

  async createSubscriptionAfterSuccess(
    userId: string,
    planType: string,
    paymentMethod: string,
    paymentId: string,
    amount: number,
    isTrial: boolean = false
  ) {
    const startDate = new Date();
    const endDate = new Date();
    const normalizedPlan = planType.toLowerCase();

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

    await this.prisma.tenantSubscription.upsert({
      where: { tenantId: tenant.id },
      update: {
        planType: planType.toUpperCase(),
        status: "ACTIVE",
        startDate,
        endDate,
        paymentMethod,
        paymentId,
        amount
      },
      create: {
        tenantId: tenant.id,
        planType: planType.toUpperCase(),
        status: "ACTIVE",
        startDate,
        endDate,
        paymentMethod,
        paymentId,
        amount
      }
    });
  }

  async createSubscription(userId: string, planType: string) {
    if (!this.razorpay) throw new InternalServerErrorException("Razorpay not configured");

    const { eligible } = await this.checkTrialEligibility(userId);

    let planId = "";
    if (planType.toLowerCase() === "basic") {
      planId = "plan_T7u6P0XKteSgsZ";
    } else if (planType.toLowerCase() === "professional") {
      planId = "plan_T7u6PUlcX9Rpfz";
    } else if (planType.toLowerCase() === "enterprise") {
      planId = "plan_T7u6RIIempfIcE";
    }
    
    let startAt: number | undefined = undefined;
    if (eligible && planType.toLowerCase() === "basic") {
      startAt = Math.floor(Date.now() / 1000) + (3 * 24 * 60 * 60);
    }

    if (!planId) throw new BadRequestException(`Plan ID not configured for ${planType}`);

    try {
      const options: any = {
        plan_id: planId,
        customer_notify: 1,
        total_count: 120,
        notes: {
          userId,
          planType
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
}
