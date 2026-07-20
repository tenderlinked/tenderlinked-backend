import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings() {
    const scrapeIntervalSetting = await this.prisma.systemSetting.findUnique({
      where: { key: "scrapeIntervalHours" },
    });
    const interval = scrapeIntervalSetting ? parseInt(scrapeIntervalSetting.value, 10) : 6;

    const smsProviderSetting = await this.prisma.systemSetting.findUnique({
      where: { key: "SMS_PROVIDER" },
    });
    const smsProvider = smsProviderSetting ? smsProviderSetting.value : "MSG91";

    const aiModeSetting = await this.prisma.systemSetting.findUnique({
      where: { key: "ACTIVE_AI_MODE" },
    });
    const aiMode = aiModeSetting ? aiModeSetting.value : "openai-mini";

    return { success: true, scrapeIntervalHours: interval, smsProvider, aiMode };
  }

  async updateSettings(body: { scrapeIntervalHours?: number; smsProvider?: string; aiMode?: string }) {
    if (body.scrapeIntervalHours !== undefined) {
      const valueStr = body.scrapeIntervalHours.toString();
      await this.prisma.systemSetting.upsert({
        where: { key: "scrapeIntervalHours" },
        update: { value: valueStr },
        create: { key: "scrapeIntervalHours", value: valueStr },
      });
    }

    if (body.smsProvider !== undefined) {
      const valueStr = body.smsProvider.toUpperCase();
      await this.prisma.systemSetting.upsert({
        where: { key: "SMS_PROVIDER" },
        update: { value: valueStr },
        create: { key: "SMS_PROVIDER", value: valueStr },
      });
    }

    if (body.aiMode !== undefined) {
      await this.prisma.systemSetting.upsert({
        where: { key: "ACTIVE_AI_MODE" },
        update: { value: body.aiMode },
        create: { key: "ACTIVE_AI_MODE", value: body.aiMode },
      });
    }
    
    return { success: true };
  }
}
