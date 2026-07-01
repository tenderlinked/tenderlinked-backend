import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings() {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: "scrapeIntervalHours" },
    });
    const interval = setting ? parseInt(setting.value, 10) : 6;
    return { success: true, scrapeIntervalHours: interval };
  }

  async updateSettings(body: { scrapeIntervalHours?: number }) {
    if (body.scrapeIntervalHours !== undefined) {
      const valueStr = body.scrapeIntervalHours.toString();
      await this.prisma.systemSetting.upsert({
        where: { key: "scrapeIntervalHours" },
        update: { value: valueStr },
        create: { key: "scrapeIntervalHours", value: valueStr },
      });
    }
    return { success: true };
  }
}
