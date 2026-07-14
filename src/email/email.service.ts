import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class EmailService {
  private readonly tenantId =
    process.env.AZURE_TENANT_ID || "449ef8af-d2d1-43ec-bdfe-a448d2d2e5a7";

  constructor(private prisma: PrismaService) {}

  private async getGraphAccessToken(): Promise<string | null> {
    const clientId = process.env.AZURE_CLIENT_ID;
    const clientSecret = process.env.AZURE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.warn("MS Graph API credentials not found.");
      return null;
    }

    const tokenParams = new URLSearchParams();
    tokenParams.append("client_id", clientId);
    tokenParams.append("scope", "https://graph.microsoft.com/.default");
    tokenParams.append("client_secret", clientSecret);
    tokenParams.append("grant_type", "client_credentials");

    try {
      const res = await fetch(
        `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`,
        {
          method: "POST",
          body: tokenParams,
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        }
      );
      const data = await res.json();
      return data.access_token || null;
    } catch (e) {
      console.error("Failed to get MS Graph access token:", e);
      return null;
    }
  }

  private async sendGraphEmail(sender: string, toEmail: string, toName: string, subject: string, htmlBody: string): Promise<boolean> {
    const token = await this.getGraphAccessToken();
    if (!token) return false;

    const emailPayload = {
      message: {
        subject: subject,
        body: { contentType: "HTML", content: htmlBody },
        toRecipients: [{ emailAddress: { address: toEmail, name: toName || toEmail } }],
      },
      saveToSentItems: "false",
    };

    try {
      const mailRes = await fetch(`https://graph.microsoft.com/v1.0/users/${sender}/sendMail`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(emailPayload),
      });

      if (!mailRes.ok) {
        const errData = await mailRes.text();
        console.error("Failed to send email via MS Graph:", errData);
        return false;
      }
      return true;
    } catch (error) {
      console.error("Exception sending email:", error);
      return false;
    }
  }

  async sendHighPriorityTenderEmail(
    tenders: any[],
    tenderType: string = "Mixed",
    recipientEmail: string = "sudhakar@enfycon.com",
    recipientName: string = "Sudhakar",
    isTest: boolean = false
  ) {
    const token = await this.getGraphAccessToken();
    if (!token) return;

    try {
      // 2. Build Email HTML
      const sender = "sahadeb@enfycon.com";

      const tendersHtml = `
        <div class="table-container" style="overflow-x: auto;">
          <table class="responsive-table" style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
            <thead>
              <tr style="background-color: #1f2937; color: #ffffff; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
                <th style="padding: 16px; border: 1px solid #374151; font-weight: 600;">${tenderType === "State" ? "Organisation" : "District"}</th>
                <th style="padding: 16px; border: 1px solid #374151; font-weight: 600; width: 45%;">Title & AI Summary</th>
                <th style="padding: 16px; border: 1px solid #374151; font-weight: 600;">Financials</th>
                <th style="padding: 16px; border: 1px solid #374151; font-weight: 600;">Timeline</th>
                <th style="padding: 16px; border: 1px solid #374151; font-weight: 600;">Documents</th>
              </tr>
            </thead>
            <tbody>
              ${tenders
                .map((tender, index) => {
                  const tidMatch = tender.title.match(/(\d{4}_[A-Z0-9]+_\d+(?:_\d+)?)/i);
                  const tid = tidMatch ? tidMatch[1] : null;

                  return `
              <tr class="responsive-tr" style="background-color: ${index % 2 === 0 ? "#ffffff" : "#f9fafb"}; border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 16px; color: #4b5563; font-weight: 600; text-transform: uppercase; font-size: 12px; vertical-align: top; border: 1px solid #e5e7eb;">
                  ${tender.district || tender.organisation || "N/A"}
                </td>
                <td style="padding: 16px; vertical-align: top; border: 1px solid #e5e7eb;">
                  <div style="color: #111827; font-weight: 700; font-size: 15px; margin-bottom: 8px; line-height: 1.4;">
                    ${tender.title.replace(/[\[\]]/g, "").trim()}
                  </div>
                  <div style="color: #6b7280; font-style: italic; font-size: 13px; line-height: 1.5;">
                    ✨ ${tender.aiSummary || "No summary available."}
                  </div>
                </td>
                <td style="padding: 16px; vertical-align: top; border: 1px solid #e5e7eb; font-size: 13px;">
                  <div style="margin-bottom: 8px;"><span style="color:#9ca3af; font-size: 11px; text-transform: uppercase; font-weight: 600;">Est. Value</span><br/><strong style="color: #059669; white-space: nowrap;">${tender.tenderValue || "N/A"}</strong></div>
                  <div style="margin-bottom: 8px;"><span style="color:#9ca3af; font-size: 11px; text-transform: uppercase; font-weight: 600;">EMD</span><br/><strong style="color: #2563eb; white-space: nowrap;">${tender.emd || "N/A"}</strong></div>
                  <div><span style="color:#9ca3af; font-size: 11px; text-transform: uppercase; font-weight: 600;">App Cost</span><br/><strong style="color: #9333ea; white-space: nowrap;">${tender.applicationCost || "N/A"}</strong></div>
                </td>
                <td style="padding: 16px; vertical-align: top; border: 1px solid #e5e7eb; font-size: 13px;">
                  <div style="margin-bottom: 6px; color: #374151; white-space: nowrap;">📅 <strong style="color:#6b7280; font-size:11px; text-transform:uppercase;">Start:</strong><br/>${tender.startDate ? new Date(tender.startDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "N/A"}</div>
                  <div style="margin-bottom: 6px; color: #374151; white-space: nowrap;">⏳ <strong style="color:#6b7280; font-size:11px; text-transform:uppercase;">End:</strong><br/>${tender.endDate ? new Date(tender.endDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "N/A"}</div>
                </td>
                <td style="padding: 16px; vertical-align: top; border: 1px solid #e5e7eb; font-size: 13px; text-align: center;">
                  ${tender.noticePdfUrl ? `<a href="${tender.noticePdfUrl}" target="_blank" style="display:inline-block; padding: 6px 12px; background-color: #eff6ff; color: #2563eb; text-decoration: none; border-radius: 4px; font-weight: 600; margin-bottom: 6px; width: 100%; box-sizing: border-box; white-space: nowrap;">📄 Notice</a><br/>` : ""}
                  ${tender.tenderPdfUrl ? `<a href="${tender.tenderPdfUrl}" target="_blank" style="display:inline-block; padding: 6px 12px; background-color: #faf5ff; color: #9333ea; text-decoration: none; border-radius: 4px; font-weight: 600; margin-bottom: 6px; width: 100%; box-sizing: border-box; white-space: nowrap;">📄 Tender</a><br/>` : ""}
                  ${tenderType === "State" ? `<div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid #e5e7eb;"><a href="https://tendersodisha.gov.in/nicgep/app?page=FrontEndAdvancedSearch&service=page" target="_blank" style="display:inline-block; padding: 6px 12px; background-color: #f3f4f6; color: #374151; text-decoration: none; border-radius: 4px; font-weight: 600; border: 1px solid #e5e7eb; width: 100%; box-sizing: border-box; white-space: nowrap;">🔍 Search on Portal</a>${tid ? `<div style="margin-top: 6px; font-size: 10px; color: #6b7280; white-space: nowrap;">ID: <strong style="user-select: all; background-color: #fef3c7; padding: 3px 6px; border-radius: 3px; color: #92400e; letter-spacing: 0.5px;">${tid}</strong></div>` : ""}</div>` : `${!tender.noticePdfUrl && !tender.tenderPdfUrl ? `<a href="${tender.sourceUrl}" target="_blank" style="display:inline-block; padding: 6px 12px; background-color: #f3f4f6; color: #374151; text-decoration: none; border-radius: 4px; font-weight: 600; border: 1px solid #e5e7eb; width: 100%; box-sizing: border-box; white-space: nowrap;">↗ View Portal</a>` : ""}`}
                </td>
              </tr>
              `;
                })
                .join("")}
            </tbody>
          </table>
        </div>
      `;

      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>enfycon Tender Alerts</title>
        </head>
        <body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
          <div style="padding: 20px; background-color: #f3f4f6;">
            <div style="max-width: 1200px; margin: 0 auto;">
              ${isTest ? `<div style="background-color: #fef2f2; color: #b91c1c; padding: 12px; text-align: center; font-weight: bold; font-size: 14px; border-radius: 8px; border: 1px dashed #f87171; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 1px;">🚨 Test Email - Non-Production Alert 🚨</div>` : ""}
              <div style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
              <!-- Header -->
              <div style="background-color: #ffffff; padding: 30px 40px; border-bottom: 1px solid #e5e7eb;">
                <div>
                  <div style="font-size: 28px; font-weight: 800; color: #4361ee; letter-spacing: -1px; margin-bottom: 4px;">enfycon</div>
                  <h1 style="color: #111827; margin: 0; font-size: 20px; font-weight: 600;">Tender Alert Report</h1>
                </div>
              </div>
              <!-- Content -->
              <div style="padding: 30px 40px 40px 40px;">
                <p style="color: #111827; font-size: 16px; margin: 0 0 24px 0; line-height: 1.6;">Dear <strong>${recipientName}</strong>,<br/><br/>We have identified <strong>${tenders.length}</strong> new high-priority ${tenderType === "Mixed" ? "" : tenderType.toLowerCase() + " "}tender${tenders.length > 1 ? "s" : ""} matching your keywords. Please review the details below.</p>
                ${tendersHtml}
                <div style="margin-top: 40px; text-align: center;">
                  <a href="https://tenders.enfycon.com/dashboard" style="display: inline-block; background-color: #4361ee; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">
                    View Full Dashboard
                  </a>
                </div>
              </div>
              <!-- Footer -->
              <div style="background-color: #f9fafb; padding: 24px; text-align: center; border-top: 1px solid #e5e7eb;">
                <p style="color: #6b7280; margin: 0; font-size: 12px;">
                  Automated alert from the enfycon Tenders System.<br/>
                  &copy; ${new Date().getFullYear()} enfycon. All rights reserved.
                </p>
              </div>
              </div>
            </div>
          </div>
        </body>
        </html>
      `;

      const subjectText =
        tenders.length === 1
          ? `Enfycon Alert: High-Priority ${tenderType === "Mixed" ? "" : tenderType + " "}Tender - ${tenders[0].title.replace(/[\[\]]/g, "").trim().substring(0, 40)}...`
          : `Enfycon Alert: ${tenders.length} New High-Priority ${tenderType === "Mixed" ? "" : tenderType + " "}Tenders`;

      const mailSent = await this.sendGraphEmail(sender, recipientEmail, recipientName, subjectText, emailHtml);
      if (mailSent) {
        console.log(`High priority tender email sent to ${recipientEmail}`);
      }
    } catch (error) {
      console.error("Exception in tender email preparation:", error);
    }
  }

  async sendWelcomeEmail(recipientEmail: string, recipientName: string) {
    const sender = "sahadeb@enfycon.com";
    const subject = "Welcome to TenderLinked!";
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #4361ee;">Welcome to TenderLinked, ${recipientName || 'User'}!</h2>
        <p>Thank you for creating an account with TenderLinked. We are thrilled to have you on board.</p>
        <p>You can now log in to your dashboard to start setting up your keywords and receiving daily tender alerts.</p>
        <a href="https://tenders.enfycon.com/login" style="display: inline-block; background-color: #4361ee; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 10px;">Login to Dashboard</a>
        <p style="margin-top: 30px; font-size: 12px; color: #888;">If you did not request this, please ignore this email.</p>
      </div>
    `;

    const success = await this.sendGraphEmail(sender, recipientEmail, recipientName, subject, htmlBody);
    if (success) {
      console.log(`Welcome email sent to ${recipientEmail}`);
    }
  }

  async sendPasswordResetOtp(recipientEmail: string, otp: string) {
    const sender = "sahadeb@enfycon.com";
    const subject = "Your Password Reset OTP - TenderLinked";
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #4361ee;">Password Reset Request</h2>
        <p>We received a request to reset your password for your TenderLinked account.</p>
        <p>Your One-Time Password (OTP) is:</p>
        <div style="font-size: 24px; font-weight: bold; padding: 15px; background-color: #f3f4f6; text-align: center; border-radius: 5px; letter-spacing: 5px; color: #111827;">
          ${otp}
        </div>
        <p style="margin-top: 20px;">This OTP will expire in 10 minutes.</p>
        <p style="margin-top: 30px; font-size: 12px; color: #888;">If you did not request this, please ignore this email and your password will remain unchanged.</p>
      </div>
    `;

    const success = await this.sendGraphEmail(sender, recipientEmail, recipientEmail, subject, htmlBody);
    if (success) {
      console.log(`Password reset OTP sent to ${recipientEmail}`);
    }
  }
}
