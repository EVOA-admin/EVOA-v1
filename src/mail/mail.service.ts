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
        <body style="font-family: Arial, sans-serif; background-color: #0D1B2A; color: #E2E8F0; padding: 40px 20px; margin: 0;">
          <div style="max-width: 540px; margin: 0 auto; background: #162032; border: 1px solid rgba(255,255,255,0.08); padding: 40px 32px; border-radius: 16px; box-shadow: 0 12px 48px rgba(0,0,0,0.5);">
            <div style="text-align: center; margin-bottom: 24px;">
              <h1 style="font-family: Arial, sans-serif; font-size: 30px; font-weight: 800; letter-spacing: 1px; color: #E2E8F0; margin: 0;">
                EVO<span style="color: #3B82F6;">-A</span>
              </h1>
              <p style="font-family: monospace; font-size: 10px; letter-spacing: 3px; color: #64748B; text-transform: uppercase; margin-top: 6px;">
                Startup · Investor · Ecosystem
              </p>
            </div>
            
            <div style="text-align: center; margin-bottom: 24px;">
              <h2 style="font-size: 22px; font-weight: 700; color: #E2E8F0; margin: 0 0 10px 0;">Verify Your Email Address</h2>
              <p style="font-size: 14px; color: #94A3B8; line-height: 1.6; margin: 0;">
                Welcome to EVOA! Please confirm your email address by clicking the button below to activate your account.
              </p>
            </div>
            
            <div style="text-align: center; margin: 32px 0;">
              <a href="${verificationLink}" style="background-color: #3B82F6; color: #FFFFFF; text-decoration: none; padding: 14px 32px; font-weight: 600; font-size: 14px; letter-spacing: 0.5px; display: inline-block; border-radius: 8px; box-shadow: 0 4px 16px rgba(59,130,246,0.3);">
                Verify Email Address
              </a>
            </div>
            
            <p style="font-size: 12px; color: #64748B; line-height: 1.5; text-align: center; word-break: break-all; margin-top: 24px;">
              If the button doesn't work, copy and paste this link into your browser:<br>
              <a href="${verificationLink}" style="color: #60A5FA; text-decoration: underline;">${verificationLink}</a>
            </p>
            
            <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.08); margin: 32px 0 16px 0;">
            <p style="font-size: 11px; color: #64748B; text-align: center; margin: 0;">
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

  async sendPasswordResetEmail(to: string, resetLink: string): Promise<boolean> {
    const pass = this.getSmtpPass();
    if (!pass) {
      const errMsg = 'Email delivery failed: SMTP_PASS is missing in Evoa-Backend/.env. Please save SMTP_PASS in Evoa-Backend/.env to send password reset emails.';
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
          <title>Reset your EVOA Password</title>
        </head>
        <body style="font-family: Arial, sans-serif; background-color: #0D1B2A; color: #E2E8F0; padding: 40px 20px; margin: 0;">
          <div style="max-width: 540px; margin: 0 auto; background: #162032; border: 1px solid rgba(255,255,255,0.08); padding: 40px 32px; border-radius: 16px; box-shadow: 0 12px 48px rgba(0,0,0,0.5);">
            <div style="text-align: center; margin-bottom: 24px;">
              <h1 style="font-family: Arial, sans-serif; font-size: 30px; font-weight: 800; letter-spacing: 1px; color: #E2E8F0; margin: 0;">
                EVO<span style="color: #3B82F6;">-A</span>
              </h1>
              <p style="font-family: monospace; font-size: 10px; letter-spacing: 3px; color: #64748B; text-transform: uppercase; margin-top: 6px;">
                Startup · Investor · Ecosystem
              </p>
            </div>
            
            <div style="text-align: center; margin-bottom: 24px;">
              <h2 style="font-size: 22px; font-weight: 700; color: #E2E8F0; margin: 0 0 10px 0;">Reset Your Password</h2>
              <p style="font-size: 14px; color: #94A3B8; line-height: 1.6; margin: 0;">
                We received a request to reset the password for your EVOA account. Click the button below to choose a new password.
              </p>
            </div>
            
            <div style="text-align: center; margin: 32px 0;">
              <a href="${resetLink}" style="background-color: #3B82F6; color: #FFFFFF; text-decoration: none; padding: 14px 32px; font-weight: 600; font-size: 14px; letter-spacing: 0.5px; display: inline-block; border-radius: 8px; box-shadow: 0 4px 16px rgba(59,130,246,0.3);">
                Reset Password
              </a>
            </div>
            
            <p style="font-size: 12px; color: #64748B; line-height: 1.5; text-align: center; word-break: break-all; margin-top: 24px;">
              If the button doesn't work, copy and paste this link into your browser:<br>
              <a href="${resetLink}" style="color: #60A5FA; text-decoration: underline;">${resetLink}</a>
            </p>
            
            <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.08); margin: 32px 0 16px 0;">
            <p style="font-size: 11px; color: #64748B; text-align: center; margin: 0;">
              If you didn't request a password reset, you can safely ignore this email.
            </p>
          </div>
        </body>
        </html>
      `;

      const info = await transporter.sendMail({
        from,
        to,
        subject: 'Reset your EVOA account password',
        html: htmlContent,
      });

      this.logger.log(`Password reset email sent to ${to}: ${info.messageId}`);
      return true;
    } catch (err) {
      this.logger.error(`Failed to send password reset email to ${to}:`, err);
      throw err;
    }
  }
}
