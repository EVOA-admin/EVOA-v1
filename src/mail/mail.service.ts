import { Injectable, Logger, OnModuleInit, InternalServerErrorException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import * as fs from 'fs';
import * as path from 'path';

function cleanEnvVar(val: string | undefined, defaultVal = ''): string {
  if (!val) return defaultVal;
  let cleaned = String(val).trim();
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  return cleaned || defaultVal;
}

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);

  async onModuleInit() {
    this.logger.log('MailService initialized with multi-candidate SMTP delivery');
  }

  private getSmtpPass(): string {
    const rawPass = process.env.SMTP_PASS || process.env.MAIL_PASS;
    const cleaned = cleanEnvVar(rawPass);
    if (cleaned) {
      return cleaned;
    }
    try {
      const envPath = path.resolve(process.cwd(), '.env');
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        const match = content.match(/^(?:SMTP_PASS|MAIL_PASS)=(.*)$/m);
        if (match && match[1]) {
          const pass = cleanEnvVar(match[1]);
          if (pass) {
            process.env.SMTP_PASS = pass;
            return pass;
          }
        }
      }
    } catch (_) { /* ignore */ }
    return '';
  }

  private getFromAddress(): string {
    const user = cleanEnvVar(process.env.SMTP_USER || process.env.MAIL_USER, 'admin@evoa.co.in');
    const rawFrom = cleanEnvVar(process.env.SMTP_FROM || process.env.MAIL_FROM);
    if (rawFrom) {
      if (rawFrom.includes('<') && rawFrom.includes('>')) {
        return rawFrom;
      }
      return `"${rawFrom}" <${user}>`;
    }
    return `"EVOA Support" <${user}>`;
  }

  private getCandidateTransporters(): nodemailer.Transporter[] {
    const user = cleanEnvVar(process.env.SMTP_USER || process.env.MAIL_USER, 'admin@evoa.co.in');
    const pass = this.getSmtpPass();
    const primaryHost = cleanEnvVar(process.env.SMTP_HOST || process.env.MAIL_HOST, 'smtp.zoho.in');
    const primaryPort = parseInt(cleanEnvVar(process.env.SMTP_PORT || process.env.MAIL_PORT, '465'), 10);
    const primarySecure = process.env.SMTP_SECURE !== 'false' && primaryPort === 465;

    const configs = [
      { host: primaryHost, port: primaryPort, secure: primarySecure },
      { host: primaryHost, port: primaryPort === 465 ? 587 : 465, secure: primaryPort !== 465 },
      { host: 'smtp.zoho.in', port: 465, secure: true },
      { host: 'smtp.zoho.in', port: 587, secure: false },
    ];

    const seen = new Set<string>();
    const uniqueConfigs = configs.filter(c => {
      const key = `${c.host}:${c.port}:${c.secure}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return uniqueConfigs.map(c =>
      nodemailer.createTransport({
        host: c.host,
        port: c.port,
        secure: c.secure,
        auth: { user, pass },
        connectionTimeout: 8000,
        greetingTimeout: 8000,
        socketTimeout: 10000,
        tls: {
          rejectUnauthorized: false,
        },
      })
    );
  }

  private async dispatchEmail(mailOptions: nodemailer.SendMailOptions): Promise<boolean> {
    const pass = this.getSmtpPass();
    if (!pass) {
      const errMsg = 'Email delivery failed: SMTP_PASS is missing in environment variables.';
      this.logger.error(errMsg);
      throw new InternalServerErrorException(errMsg);
    }

    const transporters = this.getCandidateTransporters();
    let lastErr: any = null;

    for (const transporter of transporters) {
      const options = transporter.options as any;
      try {
        const info = await transporter.sendMail(mailOptions);
        this.logger.log(`[MailService] Email delivered to ${mailOptions.to} via ${options.host}:${options.port} [Message-ID: ${info.messageId}]`);
        return true;
      } catch (err: any) {
        lastErr = err;
        this.logger.warn(`[MailService] SMTP attempt ${options.host}:${options.port} (secure=${options.secure}) failed for ${mailOptions.to}: ${err?.message || err}`);
      }
    }

    this.logger.error(`[MailService] All SMTP delivery candidates failed for ${mailOptions.to}: ${lastErr?.message || lastErr}`);
    throw lastErr || new InternalServerErrorException('Failed to deliver email via SMTP');
  }

  async sendVerificationEmail(to: string, verificationLink: string): Promise<boolean> {
    try {
      const from = this.getFromAddress();
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

      return await this.dispatchEmail({
        from,
        to,
        subject: 'Verify your EVOA account',
        html: htmlContent,
      });
    } catch (err) {
      this.logger.error(`[MailService] sendVerificationEmail error for ${to}:`, err);
      throw err;
    }
  }

  async sendPasswordResetEmail(to: string, resetLink: string): Promise<boolean> {
    try {
      const from = this.getFromAddress();
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

      return await this.dispatchEmail({
        from,
        to,
        subject: 'Reset your EVOA account password',
        html: htmlContent,
      });
    } catch (err) {
      this.logger.error(`[MailService] sendPasswordResetEmail error for ${to}:`, err);
      throw err;
    }
  }
}
