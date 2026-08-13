import { Injectable, Logger, OnModuleInit, InternalServerErrorException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private initPromise: Promise<void> | null = null;

  async onModuleInit() {
    await this.ensureTransporter();
  }

  private getSmtpPass(): string {
    if (process.env.SMTP_PASS && process.env.SMTP_PASS.trim()) {
      return process.env.SMTP_PASS.trim();
    }
    try {
      const envPath = path.resolve(process.cwd(), '.env');
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        const match = content.match(/^SMTP_PASS=(.*)$/m);
        if (match && match[1]) {
          const pass = match[1].trim().replace(/^["']|["']$/g, '');
          if (pass) {
            process.env.SMTP_PASS = pass;
            return pass;
          }
        }
      }
    } catch (_) { /* ignore */ }
    return '';
  }

  private async ensureTransporter(): Promise<nodemailer.Transporter> {
    const pass = this.getSmtpPass();
    if (pass && (!this.transporter || (this.transporter.options as any)?.auth?.pass !== pass)) {
      this.transporter = null;
      this.initPromise = null;
    }
    if (this.transporter) return this.transporter;
    if (!this.initPromise) {
      this.initPromise = this.initTransporter();
    }
    await this.initPromise;
    return this.transporter || nodemailer.createTransport({ jsonTransport: true });
  }

  private async initTransporter() {
    const host = process.env.SMTP_HOST || 'smtp.zoho.in';
    const port = parseInt(process.env.SMTP_PORT || '465', 10);
    const user = process.env.SMTP_USER || 'admin@evoa.co.in';
    const pass = this.getSmtpPass();
    const secure = process.env.SMTP_SECURE !== 'false';

    if (pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
      });
      this.logger.log(`Zoho SMTP Mailer initialized for ${user} via ${host}:${port}`);
    } else {
      this.logger.warn(`SMTP_PASS is not set in .env! Set SMTP_PASS for admin@evoa.co.in to send live emails.`);
    }
  }

  async sendVerificationEmail(to: string, verificationLink: string): Promise<boolean> {
    const pass = this.getSmtpPass();
    if (!pass) {
      const errMsg = 'Email delivery failed: SMTP_PASS is missing in Evoa-Backend/.env. Please save SMTP_PASS in Evoa-Backend/.env to send real verification emails.';
      this.logger.error(errMsg);
      throw new InternalServerErrorException(errMsg);
    }

    try {
      const transporter = await this.ensureTransporter();
      const from = process.env.SMTP_FROM || process.env.MAIL_FROM || '"EVOA Support" <admin@evoa.co.in>';
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Verify your EVOA Account</title>
        </head>
        <body style="font-family: Arial, sans-serif; background-color: #060607; color: #F4F0E8; padding: 40px 20px; margin: 0;">
          <div style="max-width: 560px; margin: 0 auto; background: #0f0f10; border: 1px solid rgba(244,240,232,0.12); padding: 36px 28px; border-radius: 8px;">
            <div style="text-align: center; margin-bottom: 24px;">
              <h1 style="font-family: 'Arial Black', sans-serif; font-size: 28px; letter-spacing: 2px; color: #F4F0E8; margin: 0;">
                EVO<span style="color: #E8341A;">-A</span>
              </h1>
              <p style="font-size: 11px; letter-spacing: 2px; color: rgba(244,240,232,0.4); text-transform: uppercase; margin-top: 4px;">
                Startup · Investor · Ecosystem
              </p>
            </div>
            
            <h2 style="font-size: 20px; color: #F4F0E8; margin-bottom: 12px; text-align: center;">Verify Your Email Address</h2>
            <p style="font-size: 14px; color: rgba(244,240,232,0.7); line-height: 1.6; margin-bottom: 24px; text-align: center;">
              Welcome to EVOA! Please confirm your email address by clicking the button below to complete your registration.
            </p>
            
            <div style="text-align: center; margin: 32px 0;">
              <a href="${verificationLink}" style="background-color: #E8341A; color: #060607; text-decoration: none; padding: 14px 28px; font-weight: bold; font-size: 13px; letter-spacing: 1.5px; text-transform: uppercase; display: inline-block; border-radius: 4px;">
                Verify Email Address
              </a>
            </div>
            
            <p style="font-size: 12px; color: rgba(244,240,232,0.4); line-height: 1.5; text-align: center; word-break: break-all; margin-top: 24px;">
              If the button doesn't work, copy and paste this link into your browser:<br>
              <a href="${verificationLink}" style="color: #E8341A;">${verificationLink}</a>
            </p>
            
            <hr style="border: none; border-top: 1px solid rgba(244,240,232,0.1); margin: 32px 0 16px 0;">
            <p style="font-size: 11px; color: rgba(244,240,232,0.3); text-align: center; margin: 0;">
              If you didn't create an account with EVOA, you can safely ignore this email.
            </p>
          </div>
        </body>
        </html>
      `;

      const info = await transporter.sendMail({
        from,
        to,
        subject: 'Verify your EVOA account',
        html: htmlContent,
      });

      this.logger.log(`Verification email sent to ${to}: ${info.messageId}`);
      return true;
    } catch (err) {
      this.logger.error(`Failed to send verification email to ${to}:`, err);
      throw err;
    }
  }
}
