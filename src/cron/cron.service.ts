import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class CronService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus() {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: "scrapeIntervalHours" },
    });

    const intervalHours = setting ? parseInt(setting.value, 10) : 6;

    if (intervalHours === 0) {
      return {
        success: true,
        shouldRun: false,
        reason: "Interval is set to 0 (Disabled)",
      };
    }

    const lastLog = await this.prisma.scrapeLog.findFirst({
      orderBy: { createdAt: "desc" },
    });

    if (lastLog) {
      const hoursSinceLast =
        (Date.now() - lastLog.createdAt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceLast < intervalHours) {
        return {
          success: true,
          shouldRun: false,
          reason: `Only ${hoursSinceLast.toFixed(1)} hours passed. Needs ${intervalHours} hours.`,
        };
      }
    }

    const targets = await this.prisma.scraperTarget.findMany({ where: { isActive: true } });

    return {
      success: true,
      shouldRun: true,
      targets,
    };
  }
}
