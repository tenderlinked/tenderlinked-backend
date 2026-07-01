import { Injectable, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class KeywordsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.priorityKeyword.findMany({ orderBy: { createdAt: "asc" } });
  }

  async create(word: string) {
    if (!word || typeof word !== "string") {
      throw new BadRequestException("Valid word is required");
    }
    try {
      return await this.prisma.priorityKeyword.create({
        data: { word: word.trim() },
      });
    } catch (error: any) {
      if (error.code === "P2002") {
        throw new BadRequestException("Keyword already exists");
      }
      throw error;
    }
  }

  async remove(id: string) {
    if (!id) {
      throw new BadRequestException("Keyword ID is required");
    }
    await this.prisma.priorityKeyword.delete({ where: { id } });
  }
}
