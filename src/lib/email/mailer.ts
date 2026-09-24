import "server-only";
import nodemailer from "nodemailer";
import { secret, appEnv } from "@/lib/config/env";
import { db } from "@/lib/db/client";

export interface SendOtpEmailParams {
  to: string;
  code: string;
  expiresMinutes?: number;
  marketCode?: string;
}

export interface SendEmailResult {
  sent: boolean;
  messageId?: string;
  provider: "gmail" | "console_dev" | "unconfigured";
  error?: string;
}

/**
 * Resolves Gmail credentials from environment secrets or database settings.
 */
async function getGmailCredentials(): Promise<{ user?: string; pass?: string }> {
  // 1. Check environment variables
  const envUser = secret("GMAIL_USER");
  const envPass = secret("GMAIL_APP_PASSWORD");

  if (envUser && envPass) {
    return { user: envUser, pass: envPass };
  }

  // 2. Fallback to DB settings
  try {
    const [dbUserSetting, dbPassSetting] = await Promise.all([
      db.setting.findFirst({ where: { key: "cms.gmailUser" } }),
      db.setting.findFirst({ where: { key: "cms.gmailAppPassword" } }),
    ]);

    const dbUser = dbUserSetting?.value ? String(dbUserSetting.value) : undefined;
    const dbPass = dbPassSetting?.value ? String(dbPassSetting.value) : undefined;

    if (dbUser && dbPass) {
      return { user: dbUser, pass: dbPass };
    }
  } catch {
    // Database read fallback failure ignored
  }

  return {};
}

/**
 * Builds a clean luxury HTML email template for customer authentication.
 */
function buildOtpEmailHtml(code: string, expiresMinutes: number): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Millennium Designs Verification Code</title>
</head>
<body style="margin: 0; padding: 0; background-color: #062319; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #fbf9f5;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #062319; padding: 40px 16px;">
    <tr>
      <td align="center">
        <!-- Main Card -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 520px; background-color: #0b2f23; border: 1px solid rgba(201, 168, 106, 0.35); border-radius: 4px; overflow: hidden; box-shadow: 0 16px 36px rgba(0, 0, 0, 0.4);">
          
          <!-- Header Logo -->
          <tr>
            <td style="padding: 36px 32px 20px; text-align: center;">
              <div style="font-family: 'Cinzel', Georgia, serif; font-size: 24px; letter-spacing: 0.2em; text-transform: uppercase; color: #fbf9f5; font-weight: 500; margin-bottom: 6px;">
                MILLENNIUM DESIGNS
              </div>
              <div style="font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: #c9a86a;">
                925 Sterling Silver Jewellery &amp; Gemstones
              </div>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding: 0 32px;">
              <div style="height: 1px; background: linear-gradient(90deg, transparent, rgba(201, 168, 106, 0.4), transparent);"></div>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 32px; text-align: center;">
              <h1 style="font-family: 'Cinzel', Georgia, serif; font-size: 22px; font-weight: 400; color: #fbf9f5; margin: 0 0 14px; letter-spacing: 0.02em;">
                Your Verification Code
              </h1>
              
              <p style="font-size: 14px; line-height: 1.6; color: #c4d0c9; margin: 0 0 28px;">
                Please use this single-use 6-digit verification code to sign in to your Millennium Designs account:
              </p>

              <!-- OTP Code Display Card -->
              <table border="0" cellspacing="0" cellpadding="0" align="center" style="margin: 0 auto 28px;">
                <tr>
                  <td style="background-color: #051811; border: 1.5px solid #c9a86a; border-radius: 4px; padding: 18px 36px; text-align: center;">
                    <span style="font-family: 'SF Mono', Monaco, Menlo, Consolas, monospace; font-size: 36px; font-weight: 700; letter-spacing: 0.35em; color: #e8d8b9; display: block; margin-left: 0.35em;">
                      ${code}
                    </span>
                  </td>
                </tr>
              </table>

              <p style="font-size: 13px; color: #8e9f96; line-height: 1.5; margin: 0 0 10px;">
                This code is valid for <strong>${expiresMinutes} minutes</strong> and can only be used once.
              </p>
              
              <p style="font-size: 12px; color: #6d8076; line-height: 1.4; margin: 0;">
                If you did not request this code, you can safely ignore this email. Your account remains secure.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #051811; border-top: 1px solid rgba(201, 168, 106, 0.2); padding: 22px 32px; text-align: center;">
              <p style="font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #c9a86a; margin: 0 0 8px;">
                Solid 925 Sterling Silver · Natural Gemstones
              </p>
              <p style="font-size: 11px; color: #6d8076; line-height: 1.5; margin: 0;">
                Millennium Designs · Opp. G.P.O., M.I. Road, Jaipur, Rajasthan 302001<br />
                Customer Support: +91 98290 56597 · concierge@millenniumdesigns.in
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Sends a customer OTP verification email via Gmail SMTP or logs to console during development.
 */
export async function sendCustomerOtpEmail(
  params: SendOtpEmailParams,
): Promise<SendEmailResult> {
  const { to, code, expiresMinutes = 10 } = params;
  const { user, pass } = await getGmailCredentials();

  // If Gmail credentials are provided, dispatch via nodemailer Gmail SMTP
  if (user && pass) {
    try {
      const cleanPass = pass.replace(/\s+/g, ""); // strip any pasted spaces in app password
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user,
          pass: cleanPass,
        },
      });

      const info = await transporter.sendMail({
        from: `"Millennium Designs" <${user}>`,
        to,
        subject: `${code} is your Millennium Designs verification code`,
        text: `Your Millennium Designs verification code is: ${code}\n\nThis code expires in ${expiresMinutes} minutes.\n\nSolid 925 Sterling Silver Jewellery · Jaipur`,
        html: buildOtpEmailHtml(code, expiresMinutes),
      });

      console.log(
        `[GMAIL SMTP SUCCESS] Dispatched OTP ${code} to ${to}, messageId: ${info.messageId}`,
      );
      return {
        sent: true,
        messageId: info.messageId,
        provider: "gmail",
      };
    } catch (error: unknown) {
      console.error(`[GMAIL SMTP ERROR] Failed to send OTP to ${to}:`, error);
      const msg =
        error instanceof Error ? error.message : "Failed to deliver email via Gmail SMTP";
      return {
        sent: false,
        provider: "gmail",
        error: msg,
      };
    }
  }

  // If unconfigured:
  const isDev = appEnv() !== "production";
  console.log(
    `[EMAIL NOTIFICATION - GMAIL UNCONFIGURED] Send code ${code} to ${to}. Set GMAIL_USER and GMAIL_APP_PASSWORD to enable live delivery.`,
  );

  return {
    sent: isDev,
    provider: isDev ? "console_dev" : "unconfigured",
    error: isDev
      ? undefined
      : "Gmail SMTP credentials not configured (GMAIL_USER & GMAIL_APP_PASSWORD required)",
  };
}
