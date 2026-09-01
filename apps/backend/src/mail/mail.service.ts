import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private resendClient: Resend | null = null;

  constructor(private readonly configService: ConfigService) {
    this.initMailClients();
  }

  private initMailClients(): void {
    // 1. Initialize Resend API client if RESEND_API_KEY is configured
    const resendApiKey =
      this.configService.get<string>('RESEND_API_KEY') ||
      (this.configService.get<string>('SMTP_PASS')?.startsWith('re_')
        ? this.configService.get<string>('SMTP_PASS')
        : undefined);

    if (resendApiKey) {
      try {
        this.resendClient = new Resend(resendApiKey);
        this.logger.log('Resend API client initialized successfully.');
      } catch (err: any) {
        this.logger.error(`Failed to initialize Resend client: ${err.message}`);
      }
    }

    // 2. Initialize Standard SMTP configuration (e.g. Gmail, Outlook, Brevo, custom SMTP)
    const host = this.configService.get<string>('SMTP_HOST')?.trim();
    const port = Number(this.configService.get<number>('SMTP_PORT', 587));
    const rawUser = this.configService.get<string>('SMTP_USER') || '';
    const rawPass = this.configService.get<string>('SMTP_PASS') || '';

    const user = rawUser.replace(/^["']|["']$/g, '').trim();
    const pass = rawPass.replace(/^["']|["']$/g, '').trim();
    const secureConfig = this.configService.get<string>('SMTP_SECURE');
    const isSecure = secureConfig !== undefined ? String(secureConfig).trim() === 'true' : port === 465;

    if (host && user && pass) {
      try {
        if (host.toLowerCase().includes('gmail.com')) {
          this.transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user, pass },
            connectionTimeout: 5000,
            greetingTimeout: 5000,
            socketTimeout: 8000,
          });
          this.logger.log(`Gmail SMTP Transporter initialized for ${user}`);
        } else {
          this.transporter = nodemailer.createTransport({
            host,
            port,
            secure: isSecure,
            auth: { user, pass },
            tls: {
              rejectUnauthorized: false,
            },
            connectionTimeout: 5000,
            greetingTimeout: 5000,
            socketTimeout: 8000,
          });
          this.logger.log(`SMTP Transporter initialized: ${host}:${port} (secure: ${isSecure}, user: ${user})`);
        }
      } catch (err: any) {
        this.logger.error(`Failed to initialize SMTP transporter: ${err.message}`);
        this.transporter = null;
      }
    }

    if (!this.resendClient && !this.transporter) {
      this.logger.log(
        'Email provider not configured in .env (set RESEND_API_KEY or SMTP credentials). Welcome credentials will be logged and surfaced in the admin UI fallback modal.',
      );
    }
  }

  /**
   * Resolves the frontend URL to use in emails.
   * Priority:
   * 1. Configured FRONTEND_URL environment variable (e.g. 'https://syntra-chat.onrender.com' or 'http://localhost:4200')
   * 2. Production fallback: 'https://syntra-chat.onrender.com' (when NODE_ENV is 'production')
   * 3. Local development fallback: 'http://localhost:4200'
   */
  getFrontendUrl(): string {
    const configured = this.configService.get<string>('FRONTEND_URL');
    if (configured && configured.trim()) {
      return configured.trim().replace(/\/+$/, '');
    }

    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production' ||
      process.env.NODE_ENV === 'production';

    if (isProduction) {
      return 'https://syntra-chat.onrender.com';
    }

    return 'http://localhost:4200';
  }

  async sendWelcomeEmail(
    toEmail: string,
    firstName: string,
    temporaryPassword: string,
  ): Promise<boolean> {
    // Skip external delivery for dummy test domains to avoid bouncing back to sender inbox
    if (toEmail.endsWith('@example.com') || toEmail.endsWith('@test.local') || toEmail.endsWith('@example.org')) {
      this.logger.log(`Skipping external mail dispatch for mock test email: ${toEmail}`);
      return true;
    }

    let fromAddress: string;
    const configuredFrom = this.configService.get<string>('SMTP_FROM');
    if (configuredFrom) {
      fromAddress = configuredFrom.replace(/^["']|["']$/g, '');
    } else if (this.transporter && this.configService.get<string>('SMTP_USER')) {
      fromAddress = `Syntra Chat <${this.configService.get<string>('SMTP_USER')}>`;
    } else if (this.resendClient) {
      fromAddress = this.configService.get<string>('RESEND_FROM') || 'onboarding@resend.dev';
    } else {
      fromAddress = 'Syntra Chat Security <no-reply@syntrachat.internal>';
    }

    const signInUrl = this.getFrontendUrl();
    const displayName = firstName ? firstName.trim() : 'there';

    const subject = 'Welcome to Syntra Chat — Your Account Credentials';

    const textContent = `Hello ${displayName},

Welcome to Syntra Chat, your private enterprise knowledge and analytics platform. An administrator has provisioned an account for you.

Here are your initial sign-in credentials:
--------------------------------------------------
Login URL:          ${signInUrl}
Email Address:      ${toEmail}
Temporary Password: ${temporaryPassword}
--------------------------------------------------

SECURITY NOTICE:
You will be required to create a new, private password immediately upon your first sign-in.
Do not share these credentials with anyone.

Best regards,
The Syntra Chat Platform Team`;

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Welcome to Syntra Chat</title>
</head>
<body style="margin: 0; padding: 0; background-color: #09090b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #fafafa;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #09090b; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 560px; background-color: #111114; border: 1px solid #27272a; border-radius: 16px; overflow: hidden; padding: 36px 32px;">
          
          <!-- Header Branding -->
          <tr>
            <td style="padding-bottom: 24px; border-bottom: 1px solid #27272a;">
              <table role="presentation" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="width: 36px; height: 36px; background-color: #18181b; border: 1px solid #27272a; border-radius: 8px; text-align: center; vertical-align: middle; color: #ffffff; font-weight: bold; font-size: 14px; font-family: monospace;">
                    SC
                  </td>
                  <td style="padding-left: 12px;">
                    <span style="font-size: 18px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">Syntra Chat</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Welcome Body -->
          <tr>
            <td style="padding-top: 28px;">
              <h1 style="font-size: 20px; font-weight: 600; color: #ffffff; margin: 0 0 12px 0;">Welcome to Syntra Chat</h1>
              <p style="font-size: 14px; line-height: 22px; color: #a1a1aa; margin: 0 0 24px 0;">
                Hello <strong style="color: #ffffff;">${displayName}</strong>,<br>
                An administrator has provisioned an enterprise account for you to access workspace documents, datasets, and AI analytics.
              </p>
            </td>
          </tr>

          <!-- Credentials Box -->
          <tr>
            <td>
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0c0c0e; border: 1px solid #27272a; border-radius: 12px; padding: 20px 24px; margin-bottom: 24px;">
                <tr>
                  <td>
                    <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #71717a; margin-bottom: 12px;">Your Temporary Sign-In Credentials</div>
                    
                    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding-bottom: 10px; font-size: 13px; color: #a1a1aa; width: 120px;">Email:</td>
                        <td style="padding-bottom: 10px; font-size: 13px; font-weight: 600; color: #ffffff; font-family: monospace;">${toEmail}</td>
                      </tr>
                      <tr>
                        <td style="font-size: 13px; color: #a1a1aa;">Temporary Password:</td>
                        <td style="font-size: 14px; font-weight: 700; color: #38bdf8; font-family: monospace; letter-spacing: 1px;">${temporaryPassword}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Security Note -->
          <tr>
            <td style="padding-bottom: 28px;">
              <div style="background-color: rgba(59, 130, 246, 0.08); border-left: 3px solid #3b82f6; padding: 12px 16px; border-radius: 4px;">
                <p style="font-size: 12px; line-height: 18px; color: #93c5fd; margin: 0;">
                  <strong>Required on first sign-in:</strong> For security compliance, you will be prompted to create your own permanent password immediately upon logging in.
                </p>
              </div>
            </td>
          </tr>

          <!-- Call to Action Button -->
          <tr>
            <td align="center" style="padding-bottom: 32px;">
              <table role="presentation" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="border-radius: 10px; background-color: #ffffff;">
                    <a href="${signInUrl}" target="_blank" style="font-size: 14px; font-weight: 600; color: #000000; text-decoration: none; padding: 12px 28px; display: inline-block; border-radius: 10px;">
                      Sign In to Syntra Chat &rarr;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="border-top: 1px solid #27272a; padding-top: 20px; font-size: 11px; color: #71717a; line-height: 18px;">
              <p style="margin: 0 0 6px 0;">
                This security email was automatically generated by Syntra Chat. Please do not reply to this email.
              </p>
              <p style="margin: 0;">
                If you did not expect an account or believe this was sent in error, please contact your workspace administrator.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

    // 1. Try sending via Resend API (with strict 5s timeout)
    if (this.resendClient) {
      try {
        const { data, error } = await this.executeWithTimeout(
          this.resendClient.emails.send({
            from: fromAddress,
            to: toEmail,
            subject,
            text: textContent,
            html: htmlContent,
          }),
          5000,
          'Resend dispatch',
        );

        if (!error && data?.id) {
          this.logger.log(`Welcome email successfully sent to ${toEmail} via Resend (ID: ${data.id})`);
          return true;
        }
        if (error) {
          this.logger.warn(`Resend API error sending email to ${toEmail}: ${error.message}. Trying fallback transport...`);
        }
      } catch (err: any) {
        this.logger.warn(`Resend dispatch exception to ${toEmail}: ${err.message}. Trying fallback transport...`);
      }
    }

    // 2. Try sending via SMTP (Nodemailer with strict 5s timeout)
    if (this.transporter) {
      try {
        await this.executeWithTimeout(
          this.transporter.sendMail({
            from: fromAddress,
            to: toEmail,
            subject,
            text: textContent,
            html: htmlContent,
          }),
          5000,
          'SMTP dispatch',
        );
        this.logger.log(`Welcome email successfully sent to ${toEmail} via SMTP`);
        return true;
      } catch (err: any) {
        this.logger.error(`SMTP dispatch exception to ${toEmail}: ${err.message}`);
        // Do not throw; return false so admin fallback modal handles credentials gracefully
        return false;
      }
    }

    // 3. Development Fallback
    this.logger.warn(
      `[DEVELOPMENT FALLBACK] Welcome credentials generated for ${toEmail}. Mail delivery unavailable (no RESEND_API_KEY or SMTP credentials configured).`,
    );
    return false;
  }

  private async executeWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    operationName: string,
  ): Promise<T> {
    let timeoutHandle: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      clearTimeout(timeoutHandle!);
    }
  }
}
