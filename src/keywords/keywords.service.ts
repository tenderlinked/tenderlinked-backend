import { Injectable, BadRequestException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { GoogleGenAI } from '@google/genai';

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

  // ---- Expansion Dictionary Management ----

  async createExpansion(baseWord: string, expansions: string[] = [], status: string = 'PENDING') {
    if (!baseWord) throw new BadRequestException("baseWord is required");
    return this.prisma.keywordExpansion.upsert({
      where: { baseWord },
      update: { expansions, status },
      create: { baseWord, expansions, status }
    });
  }

  async getPendingExpansions() {
    return this.prisma.keywordExpansion.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'desc' }
    });
  }

  async approveExpansion(id: string, expansions: string[]) {
    return this.prisma.keywordExpansion.update({
      where: { id },
      data: { 
        expansions,
        status: 'APPROVED'
      }
    });
  }

  async rejectExpansion(id: string) {
    return this.prisma.keywordExpansion.update({
      where: { id },
      data: { status: 'REJECTED' }
    });
  }

  async autoExpandKeyword(id: string) {
    const keywordRecord = await this.prisma.keywordExpansion.findUnique({ where: { id } });
    if (!keywordRecord) throw new NotFoundException("Keyword not found");
    
    return this.generateExpansionsFromAI(keywordRecord.baseWord);
  }

  async generateAndSaveExpansion(baseWord: string) {
    if (!baseWord) throw new BadRequestException("baseWord is required");
    
    // Call AI to get expansions
    const expansions = await this.generateExpansionsFromAI(baseWord);
    
    // Save directly to the database as APPROVED
    return this.prisma.keywordExpansion.upsert({
      where: { baseWord },
      update: { expansions, status: 'APPROVED' },
      create: { baseWord, expansions, status: 'APPROVED' }
    });
  }

  private async generateExpansionsFromAI(baseWord: string): Promise<string[]> {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) throw new BadRequestException("Gemini API key is not configured.");

    const ai = new GoogleGenAI({ apiKey });
    
    const prompt = `You are an expert in business and government tenders.
Expand the following ambiguous acronym or keyword into a list of its most likely unambiguous full industry terms.
Return ONLY a valid JSON array of strings, nothing else.
For example, if the input is "IT", return ["Information Technology", "Software", "IT Consulting"].
Keyword: "${baseWord}"`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      if (!response.text) {
        throw new Error("Empty response from AI");
      }

      const jsonText = response.text.replace(/```json/gi, '').replace(/```/g, '').trim();
      return JSON.parse(jsonText);
    } catch (error) {
      console.error("AI Expansion Error:", error);
      throw new BadRequestException("Failed to generate AI expansions");
    }
  }
}
