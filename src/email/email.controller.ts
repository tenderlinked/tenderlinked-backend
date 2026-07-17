import { Controller, Get, Post, Body, InternalServerErrorException } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "./email.service";
import { extractTenderDetailsFromPdf } from "../scraper/pdf-extractor";

@ApiTags("Email")
@Controller()
export class EmailController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService
  ) {}

  @Get("test-email")
  @ApiOperation({ summary: "Send a test email with high priority tenders" })
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })async testEmail() {
    try {
      const keywordsData = await this.prisma.priorityKeyword.findMany();
      const keywordList = keywordsData.map((k: any) => k.word);

      if (keywordList.length === 0) {
        return { success: false, message: "No keywords found in DB" };
      }

      const keywordConditions = [
        ...keywordList.map((kw: string) => ({
          title: { contains: kw, mode: "insensitive" as const },
        })),
        ...keywordList.map((kw: string) => ({
          aiData: { aiSummary: { contains: kw, mode: "insensitive" as const } },
        })),
      ];

      const allTenders = await this.prisma.tender.findMany({
        where: { OR: keywordConditions },
      });

      if (allTenders.length === 0) {
        return { success: false, message: "No high priority tenders found." };
      }

      const recipients = await (this.prisma as any).emailRecipient.findMany();
      const testRecipients = [...recipients];
      if (!testRecipients.find((r: any) => r.email === "sahadeb@enfycon.com")) {
        testRecipients.push({ email: "sahadeb@enfycon.com", name: "Sahadeb" });
      }

      for (const r of testRecipients) {
        await this.emailService.sendHighPriorityTenderEmail(
          allTenders,
          "Unified", // passing 'Unified' or general identifier instead of District/State
          r.email,
          r.name,
          true
        );
      }

      return {
        success: true,
        message: `Test email sent for ${allTenders.length} high-priority tenders.`,
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  @Post("test-pdf")
  @ApiOperation({ summary: "Test PDF extraction" })
  @ApiResponse({ status: 200, description: 'Successful response' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'Internal Server Error' })@ApiBody({ schema: { properties: { pdfUrl: { type: "string", description: "URL of the PDF to extract" } } } })
  async testPdf(@Body() body: { pdfUrl: string }) {
    if (!body || !body.pdfUrl) {
      throw new InternalServerErrorException("Missing pdfUrl in request body.");
    }

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "your_gemini_api_key_here") {
      throw new InternalServerErrorException(
        "GEMINI_API_KEY is missing or invalid in your .env file. Please add a valid key to test the AI extraction."
      );
    }

    const extractedData = await extractTenderDetailsFromPdf(body.pdfUrl);

    if (!extractedData) {
      throw new InternalServerErrorException(
        "Failed to extract data. The PDF might be empty, unreadable, or not a valid tender document."
      );
    }

    return { success: true, pdfUrl: body.pdfUrl, extractedData };
  }
}
