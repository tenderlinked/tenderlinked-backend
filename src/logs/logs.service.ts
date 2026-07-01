import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class LogsService {
  constructor(private readonly prisma: PrismaService) {}

  async getScrapeLogs(page: number, pageSize: number) {
    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const [logs, total] = await Promise.all([
      this.prisma.scrapeLog.findMany({
        skip,
        take,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.scrapeLog.count(),
    ]);

    return {
      success: true,
      data: logs,
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }
}
