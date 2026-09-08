import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Safely parses a string/boolean/number value into a boolean with a fallback.
 */
function parseBoolean(val: any, defaultVal: boolean): boolean {
  if (val === undefined || val === null || val === '') return defaultVal;
  if (typeof val === 'boolean') return val;
  const str = String(val).trim().toLowerCase();
  if (str === 'true' || str === '1' || str === 'yes') return true;
  if (str === 'false' || str === '0' || str === 'no') return false;
  return defaultVal;
}

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly configService: ConfigService) {
    this.initMailClients();
  }

  async onModuleInit(): Promise<void> {
    if (this.transporter) {
      await this.verifyConnection();
    }
  }

  /**
   * Initializes the standard SMTP transporter using configured environment variables.
   * Supports standard SMTP and Gmail SMTP with Google App Passwords.
   */
  private initMailClients(): void {
    this.logger.log('[MAIL DEBUG] MailService initialized');

    // Read raw variables from ConfigService or fallback to process.env
    const rawUser = this.configService.get<string>('SMTP_USER') || process.env.SMTP_USER || '';
    const rawPass = this.configService.get<string>('SMTP_PASS') || process.env.SMTP_PASS || '';
    const rawHost = this.configService.get<string>('SMTP_HOST') || process.env.SMTP_HOST || '';
    const rawPort = this.configService.get<any>('SMTP_PORT') ?? process.env.SMTP_PORT;
    const rawSecure = this.configService.get<any>('SMTP_SECURE') ?? process.env.SMTP_SECURE;
    const rawFrom = this.configService.get<string>('SMTP_FROM') || process.env.SMTP_FROM || '';
    const rawFrontendUrl = this.configService.get<string>('FRONTEND_URL') || process.env.FRONTEND_URL || '';

    let user = String(rawUser).replace(/^["']|["']$/g, '').trim();
    let pass = String(rawPass).replace(/^["']|["']$/g, '').trim();
    let host = String(rawHost).replace(/^["']|["']$/g, '').trim();
    let from = String(rawFrom).replace(/^["']|["']$/g, '').trim();

    if (!host && user.toLowerCase().endsWith('@gmail.com')) {
      host = 'smtp.gmail.com';
    }

    const isGmail = host.toLowerCase().includes('gmail.com');
    if (isGmail) {
      // Strip spaces from Gmail 16-character App Passwords (e.g. 'xxxx xxxx xxxx xxxx' -> 'xxxxxxxxxxxxxxxx')
      pass = pass.replace(/\s+/g, '');
    }

    const cleanPortStr = rawPort !== undefined && rawPort !== null ? String(rawPort).replace(/^["']|["']$/g, '').trim() : '';
    const port = cleanPortStr ? Number(cleanPortStr) : (isGmail ? 465 : 587);

    const cleanSecureStr = rawSecure !== undefined && rawSecure !== null ? String(rawSecure).replace(/^["']|["']$/g, '').trim() : undefined;
    const isSecure = parseBoolean(cleanSecureStr, port === 465);

    this.logger.log(`[MAIL DEBUG] SMTP_HOST=${host || '<not set>'}`);
    this.logger.log(`[MAIL DEBUG] SMTP_PORT=${port}`);
    this.logger.log(`[MAIL DEBUG] SMTP_SECURE=${isSecure}`);
    this.logger.log(`[MAIL DEBUG] SMTP_USER=${this.maskEmail(user)}`);
    this.logger.log(`[MAIL DEBUG] SMTP_FROM=${from ? this.maskEmail(from) : '<not set>'}`);
    this.logger.log(`[MAIL DEBUG] SMTP_PASS=${pass ? '<configured>' : '<not configured>'}`);
    this.logger.log(`[MAIL DEBUG] FRONTEND_URL=${rawFrontendUrl || '<not set>'}`);

    if (host && user && pass) {
      try {
        this.logger.log('[MAIL DEBUG] Creating SMTP transporter...');
        this.transporter = nodemailer.createTransport({
          host,
          port,
          secure: isSecure,
          auth: {
            user,
            pass,
          },
          tls: {
            rejectUnauthorized: false,
          },
          connectionTimeout: 10000,
          greetingTimeout: 10000,
          socketTimeout: 15000,
        });

        this.logger.log(
          `[MAIL DEBUG] SMTP transporter configured:\nhost=${host}\nport=${port}\nsecure=${isSecure}\nuser=${this.maskEmail(user)}`,
        );
      } catch (err: any) {
        this.logger.error(`[MAIL DEBUG] Failed to initialize SMTP transporter: ${err.message}`);
        this.transporter = null;
      }
    } else {
      this.logger.warn(
        `[MAIL DEBUG] SMTP not configured. Missing required variables (host=${host || 'MISSING'}, user=${user ? this.maskEmail(user) : 'MISSING'}, pass=${pass ? 'CONFIGURED' : 'MISSING'}). Welcome emails will be skipped.`,
      );
    }
  }

  /**
   * Safely masks an email address for logging without leaking full credentials.
   */
  private maskEmail(email: string): string {
    if (!email) return 'N/A';
    const parts = email.split('@');
    if (parts.length === 2) {
      const [name, domain] = parts;
      const maskedName = name.length > 2 ? `${name.substring(0, 2)}***` : `${name}***`;
      return `${maskedName}@${domain}`;
    }
    return `${email.substring(0, 2)}***`;
  }

  /**
   * Safely verifies SMTP connection.
   */
  async verifyConnection(): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn('[MAIL DEBUG] Cannot verify connection: SMTP transporter is not initialized.');
      return false;
    }
    try {
      this.logger.log('[MAIL DEBUG] Calling transporter.verify()...');
      await this.executeWithTimeout(this.transporter.verify(), 8000, 'SMTP connection verification');
      this.logger.log('[MAIL DEBUG] SMTP verification SUCCESS');
      return true;
    } catch (err: any) {
      this.logger.error(
        `[MAIL DEBUG] SMTP verification FAILED\ncode=${err.code || 'UNKNOWN'}\nmessage=${err.message}\nresponse=${err.response || 'N/A'}\ncommand=${err.command || 'N/A'}`,
      );
      return false;
    }
  }

  /**
   * Resolves the frontend URL to use in emails.
   */
  getFrontendUrl(): string {
    const configured = this.configService.get<string>('FRONTEND_URL') || process.env.FRONTEND_URL;
    if (configured && configured.trim()) {
      const cleanUrl = configured.trim().replace(/\/+$/, '');
      if (!cleanUrl.includes('localhost') && !cleanUrl.includes('127.0.0.1')) {
        return cleanUrl;
      }
    }

    return 'https://syntra-chat.onrender.com';
  }

  /**
   * Resolves the full dashboard sign-in URL for welcome emails.
   */
  getDashboardUrl(): string {
    const baseUrl = this.getFrontendUrl();
    if (baseUrl.endsWith('/dashboard')) {
      return baseUrl;
    }
    return `${baseUrl}/dashboard`;
  }

  /**
   * Discovers the application logo file and returns a CID attachment definition.
   */
  private getLogoAttachment(): nodemailer.SendMailOptions['attachments'] {
    const candidatePaths = [
      path.resolve(process.cwd(), 'apps/frontend/public/logo-icon.png'),
      path.resolve(process.cwd(), 'apps/frontend/public/logo.png'),
      path.resolve(process.cwd(), 'logo.png'),
      path.resolve(__dirname, '../../../../apps/frontend/public/logo-icon.png'),
      path.resolve(__dirname, '../../../../logo.png'),
    ];

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        return [
          {
            filename: 'logo.png',
            path: p,
            cid: 'syntra-logo',
          },
        ];
      }
    }
    return [];
  }

  /**
   * Dispatches the enterprise welcome email with temporary sign-in credentials.
   * Never throws exceptions; returns true on successful delivery, false on failure or missing setup.
   */
  async sendWelcomeEmail(
    toEmail: string,
    firstName: string,
    temporaryPassword: string,
  ): Promise<boolean> {
    this.logger.log(`[MAIL TRACE] sendWelcomeEmail() ENTERED for toEmail=${this.maskEmail(toEmail)}`);

    // Skip external delivery for dummy test domains to avoid bouncing back to sender inbox
    if (
      toEmail.endsWith('@example.com') ||
      toEmail.endsWith('@test.local') ||
      toEmail.endsWith('@example.org')
    ) {
      this.logger.log(`[MAIL DEBUG] Skipping external mail dispatch for mock test domain: ${this.maskEmail(toEmail)}`);
      return true;
    }

    const transporterExists = !!this.transporter;
    this.logger.log(`[MAIL DEBUG] SMTP transporter exists=${transporterExists}`);

    if (!this.transporter) {
      this.logger.warn(
        `[MAIL DEBUG] Email delivery skipped for ${this.maskEmail(toEmail)}: No active SMTP transporter. Returning emailSent=false.`,
      );
      return false;
    }

    let fromAddress: string;
    const configuredFrom = this.configService.get<string>('SMTP_FROM') || process.env.SMTP_FROM;
    if (configuredFrom && configuredFrom.trim()) {
      fromAddress = configuredFrom.replace(/^["']|["']$/g, '').trim();
    } else if (this.configService.get<string>('SMTP_USER') || process.env.SMTP_USER) {
      const userEmail = (this.configService.get<string>('SMTP_USER') || process.env.SMTP_USER)!.replace(/^["']|["']$/g, '').trim();
      fromAddress = `Syntra Chat <${userEmail}>`;
    } else {
      fromAddress = 'Syntra Chat Security <no-reply@syntrachat.internal>';
    }

    const dashboardUrl = this.getDashboardUrl();
    const displayName = firstName ? firstName.trim() : 'there';
    const subject = 'Welcome to Syntra Chat — Your Account Credentials';

    const textContent = `Hello ${displayName},

Welcome to Syntra Chat. Your account is ready. You now have access to the workspace resources shared with you.

Here are your initial sign-in credentials:
--------------------------------------------------
Login URL:          ${dashboardUrl}
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
                  <td style="width: 36px; height: 36px; vertical-align: middle;">
                    <img src="cid:syntra-logo" alt="Syntra Chat" width="36" height="36" style="display: block; width: 36px; height: 36px; border-radius: 8px; object-fit: contain;" />
                  </td>
                  <td style="padding-left: 12px; vertical-align: middle;">
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
                Your account is ready. You now have access to the workspace resources shared with you.
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
                        <td style="font-size: 14px; font-weight: 700; color: #e11d48; font-family: monospace; letter-spacing: 1px;">${temporaryPassword}</td>
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
              <div style="background-color: rgba(225, 29, 72, 0.08); border-left: 3px solid #e11d48; padding: 12px 16px; border-radius: 4px;">
                <p style="font-size: 12px; line-height: 18px; color: #fecdd3; margin: 0;">
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
                    <a href="${dashboardUrl}" target="_blank" style="font-size: 14px; font-weight: 600; color: #000000; text-decoration: none; padding: 12px 28px; display: inline-block; border-radius: 10px;">
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

    try {
      this.logger.log(`[MAIL TRACE] About to call transporter.sendMail() to ${this.maskEmail(toEmail)}`);

      const attachments = this.getLogoAttachment();

      const mailOptions: nodemailer.SendMailOptions = {
        from: fromAddress,
        to: toEmail,
        subject,
        text: textContent,
        html: htmlContent,
      };

      if (attachments && attachments.length > 0) {
        mailOptions.attachments = attachments;
      }

      const info = await this.executeWithTimeout(
        this.transporter.sendMail(mailOptions),
        10000,
        'SMTP dispatch',
      );

      this.logger.log(
        `[MAIL TRACE] transporter.sendMail() SUCCESS\nmessageId=${info?.messageId || 'N/A'}\nresponse=${info?.response || 'OK'}`,
      );
      this.logger.log('[MAIL TRACE] EMAIL ACCEPTED BY SMTP');
      this.logger.log('[MAIL TRACE] sendWelcomeEmail() returning true');
      return true;
    } catch (err: any) {
      this.logger.error(
        `[MAIL TRACE] transporter.sendMail() FAILED\ncode=${err.code || 'UNKNOWN'}\ncommand=${err.command || 'N/A'}\nresponse=${err.response || 'N/A'}\nmessage=${err.message}`,
      );
      this.logger.log('[MAIL TRACE] sendWelcomeEmail() returning false');
      return false;
    }
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
