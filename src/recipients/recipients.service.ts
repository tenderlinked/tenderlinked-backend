import { Injectable, BadRequestException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class RecipientsService {
  private readonly tenantId =
    process.env.AZURE_TENANT_ID || "a42b1dbd-88b6-455b-86ad-e0d29d89288f";

  constructor(private readonly prisma: PrismaService) {}

  private async getGraphToken(): Promise<string> {
    const clientId = process.env.AZURE_CLIENT_ID;
    const clientSecret = process.env.AZURE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new BadRequestException("Microsoft Graph credentials are not configured");
    }

    const tokenUrl = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;
    const params = new URLSearchParams();
    params.append("client_id", clientId);
    params.append("client_secret", clientSecret);
    params.append("scope", "https://graph.microsoft.com/.default");
    params.append("grant_type", "client_credentials");

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!response.ok) {
      throw new Error("Failed to authenticate with Microsoft Graph");
    }

    const data = await response.json();
    return data.access_token;
  }

  async findAll() {
    return (this.prisma as any).emailRecipient.findMany({ orderBy: { createdAt: "desc" } });
  }

  async create(email: string) {
    if (!email) {
      throw new BadRequestException("Email is required");
    }

    const token = await this.getGraphToken();

    const graphRes = await fetch(`https://graph.microsoft.com/v1.0/users/${email}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!graphRes.ok) {
      throw new NotFoundException("User not found in Microsoft Directory");
    }

    const userData = await graphRes.json();
    const name = userData.displayName || email.split("@")[0];

    try {
      return await (this.prisma as any).emailRecipient.create({
        data: { email: email.toLowerCase(), name },
      });
    } catch (error: any) {
      if (error.code === "P2002") {
        throw new BadRequestException("This email is already in the recipient list.");
      }
      throw error;
    }
  }

  async remove(id: string) {
    if (!id) {
      throw new BadRequestException("ID is required");
    }
    await (this.prisma as any).emailRecipient.delete({ where: { id } });
  }
}
