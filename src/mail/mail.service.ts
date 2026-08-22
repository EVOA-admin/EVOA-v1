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
    const hasResend = !!cleanEnvVar(process.env.RESEND_API_KEY);
    const hasBrevo = !!cleanEnvVar(process.env.BREVO_API_KEY);
    const hasSmtp = !!this.getSmtpPass();
    this.logger.log(`MailService initialized (Providers available: Resend=${hasResend}, Brevo=${hasBrevo}, SMTP=${hasSmtp})`);
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

  private async sendViaResend(
    to: string,
    subject: string,
    html: string,
    attachments?: Array<{ filename: string; content: Buffer | string; contentType?: string }>,
  ): Promise<{ success: boolean; id?: string; error?: string }> {
    const apiKey = cleanEnvVar(process.env.RESEND_API_KEY);
    if (!apiKey) return { success: false, error: 'RESEND_API_KEY not configured' };

    const from = cleanEnvVar(process.env.RESEND_FROM) || this.getFromAddress();

    const formattedAttachments = attachments?.map((att) => ({
      filename: att.filename,
      content: Buffer.isBuffer(att.content) ? att.content.toString('base64') : att.content,
    }));

    try {
      const payload: any = {
        from,
        to: [to],
        subject,
        html,
      };

      if (formattedAttachments && formattedAttachments.length > 0) {
        payload.attachments = formattedAttachments;
      }

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const body = await res.json().catch(() => ({}));
      if (res.ok && body?.id) {
        this.logger.log(`[MailService] Email delivered to ${to} via Resend HTTPS API [ID: ${body.id}]`);
        return { success: true, id: body.id };
      }
      const errMsg = body?.message || body?.error || `HTTP ${res.status}`;
      this.logger.warn(`[MailService] Resend API failed: ${errMsg}`);
      return { success: false, error: errMsg };
    } catch (err: any) {
      this.logger.warn(`[MailService] Resend network error: ${err?.message || err}`);
      return { success: false, error: err?.message || String(err) };
    }
  }

  private async sendViaBrevo(
    to: string,
    subject: string,
    html: string,
    attachments?: Array<{ filename: string; content: Buffer | string; contentType?: string }>,
  ): Promise<{ success: boolean; id?: string; error?: string }> {
    const apiKey = cleanEnvVar(process.env.BREVO_API_KEY);
    if (!apiKey) return { success: false, error: 'BREVO_API_KEY not configured' };

    const fromRaw = cleanEnvVar(process.env.BREVO_FROM) || cleanEnvVar(process.env.SMTP_FROM) || this.getFromAddress();
    let senderName = 'EVOA';
    let senderEmail = 'admin@evoa.co.in';
    const match = fromRaw.match(/(?:"?([^"]*)"?\s*)?<([^>]+)>/);
    if (match) {
      if (match[1]) senderName = match[1].trim();
      if (match[2]) senderEmail = match[2].trim();
    } else if (fromRaw.includes('@')) {
      senderEmail = fromRaw.trim();
    }

    const formattedAttachments = attachments?.map((att) => ({
      name: att.filename,
      content: Buffer.isBuffer(att.content) ? att.content.toString('base64') : att.content,
    }));

    try {
      const payload: any = {
        sender: { name: senderName, email: senderEmail },
        to: [{ email: to }],
        subject,
        htmlContent: html,
      };

      if (formattedAttachments && formattedAttachments.length > 0) {
        payload.attachment = formattedAttachments;
      }

      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const body = await res.json().catch(() => ({}));
      if (res.ok && (body?.messageId || body?.id)) {
        const id = body.messageId || body.id;
        this.logger.log(`[MailService] Email delivered to ${to} via Brevo HTTPS API [ID: ${id}]`);
        return { success: true, id };
      }
      const errMsg = body?.message || `HTTP ${res.status}`;
      this.logger.warn(`[MailService] Brevo API failed: ${errMsg}`);
      return { success: false, error: errMsg };
    } catch (err: any) {
      this.logger.warn(`[MailService] Brevo network error: ${err?.message || err}`);
      return { success: false, error: err?.message || String(err) };
    }
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

  private async dispatchEmail(mailOptions: {
    from?: string;
    to: string;
    subject: string;
    html: string;
    attachments?: Array<{ filename: string; content: Buffer | string; contentType?: string }>;
  }): Promise<boolean> {
    const to = Array.isArray(mailOptions.to) ? mailOptions.to[0] : String(mailOptions.to);

    // 1. Try Resend HTTPS REST API (Port 443 - never blocked by cloud hosts like Render)
    if (cleanEnvVar(process.env.RESEND_API_KEY)) {
      const res = await this.sendViaResend(to, mailOptions.subject, mailOptions.html, mailOptions.attachments);
      if (res.success) return true;
    }

    // 2. Try Brevo HTTPS REST API (Port 443 - never blocked)
    if (cleanEnvVar(process.env.BREVO_API_KEY)) {
      const res = await this.sendViaBrevo(to, mailOptions.subject, mailOptions.html, mailOptions.attachments);
      if (res.success) return true;
    }

    // 3. Fallback to direct SMTP multi-candidate delivery
    const pass = this.getSmtpPass();
    if (!pass) {
      const errMsg = 'Email delivery failed: Neither HTTPS API (RESEND_API_KEY / BREVO_API_KEY) nor SMTP_PASS is configured.';
      this.logger.error(errMsg);
      throw new InternalServerErrorException(errMsg);
    }

    const transporters = this.getCandidateTransporters();
    let lastErr: any = null;

    const nodemailerAttachments = mailOptions.attachments?.map((att) => ({
      filename: att.filename,
      content: Buffer.isBuffer(att.content) ? att.content : Buffer.from(att.content, 'base64'),
      contentType: att.contentType || 'application/pdf',
    }));

    for (const transporter of transporters) {
      const options = transporter.options as any;
      try {
        const info = await transporter.sendMail({
          from: mailOptions.from || this.getFromAddress(),
          to: mailOptions.to,
          subject: mailOptions.subject,
          html: mailOptions.html,
          attachments: nodemailerAttachments,
        });
        this.logger.log(`[MailService] Email delivered to ${mailOptions.to} via SMTP ${options.host}:${options.port} [Message-ID: ${info.messageId}]`);
        return true;
      } catch (err: any) {
        lastErr = err;
        this.logger.warn(`[MailService] SMTP attempt ${options.host}:${options.port} (secure=${options.secure}) failed for ${mailOptions.to}: ${err?.message || err}`);
      }
    }

    this.logger.error(`[MailService] All delivery candidates failed for ${mailOptions.to}: ${lastErr?.message || lastErr}`);
    throw lastErr || new InternalServerErrorException('Failed to deliver email via available providers');
  }

  async testDelivery(to: string): Promise<{ success: boolean; details: any }> {
    const attempts: any[] = [];
    const from = this.getFromAddress();
    const subject = 'EVOA Mailer Test Diagnostic';
    const html = '<p>This is a test diagnostic email sent from EVOA backend.</p>';

    if (cleanEnvVar(process.env.RESEND_API_KEY)) {
      const res = await this.sendViaResend(to, subject, html);
      attempts.push({ provider: 'Resend HTTPS API', ...res });
      if (res.success) return { success: true, details: { method: 'Resend HTTPS API', attempts } };
    }

    if (cleanEnvVar(process.env.BREVO_API_KEY)) {
      const res = await this.sendViaBrevo(to, subject, html);
      attempts.push({ provider: 'Brevo HTTPS API', ...res });
      if (res.success) return { success: true, details: { method: 'Brevo HTTPS API', attempts } };
    }

    const pass = this.getSmtpPass();
    if (pass) {
      const transporters = this.getCandidateTransporters();
      for (const t of transporters) {
        const opt = t.options as any;
        try {
          const info = await t.sendMail({ from, to, subject, html });
          attempts.push({ provider: `SMTP (${opt.host}:${opt.port})`, success: true, messageId: info.messageId });
          return { success: true, details: { method: `SMTP ${opt.host}:${opt.port}`, attempts } };
        } catch (e: any) {
          attempts.push({ provider: `SMTP (${opt.host}:${opt.port})`, success: false, error: e?.message || String(e) });
        }
      }
    } else {
      attempts.push({ provider: 'SMTP', success: false, error: 'SMTP_PASS not provided' });
    }

    return { success: false, details: { attempts } };
  }

  async sendVerificationEmail(to: string, verificationLink: string): Promise<boolean> {
    try {
      const from = this.getFromAddress();
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Verify your EVOA Account</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F8FAFC; color: #0F172A; padding: 40px 20px; margin: 0;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 560px; margin: 0 auto; background-color: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 16px; box-shadow: 0 4px 24px rgba(15, 23, 42, 0.06); overflow: hidden;">
            <tr>
              <td style="padding: 40px 36px;">
                <!-- Brand Header -->
                <div style="text-align: center; margin-bottom: 28px;">
                  <h1 style="font-size: 30px; font-weight: 800; letter-spacing: 0.5px; color: #0F172A; margin: 0;">
                    EVO<span style="color: #2563EB;">-A</span>
                  </h1>
                  <p style="font-family: 'SF Mono', Menlo, Consolas, Monaco, monospace; font-size: 10px; letter-spacing: 2.5px; color: #64748B; text-transform: uppercase; margin: 6px 0 0 0;">
                    Startup · Investor · Ecosystem
                  </p>
                </div>
                
                <!-- Main Message -->
                <div style="text-align: center; margin-bottom: 28px;">
                  <h2 style="font-size: 22px; font-weight: 700; color: #0F172A; margin: 0 0 12px 0;">Verify Your Email Address</h2>
                  <p style="font-size: 15px; color: #475569; line-height: 1.6; margin: 0;">
                    Welcome to EVOA! Please confirm your email address by clicking the button below to activate your account and access the platform.
                  </p>
                </div>
                
                <!-- Action Button -->
                <div style="text-align: center; margin: 32px 0;">
                  <a href="${verificationLink}" style="background-color: #2563EB; color: #FFFFFF; text-decoration: none; padding: 14px 34px; font-weight: 600; font-size: 15px; letter-spacing: 0.3px; display: inline-block; border-radius: 10px; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.28);">
                    Verify Email Address
                  </a>
                </div>
                
                <!-- Fallback URL -->
                <div style="background-color: #F1F5F9; border-radius: 8px; padding: 14px 16px; margin-top: 28px;">
                  <p style="font-size: 12px; color: #64748B; line-height: 1.5; margin: 0 0 6px 0; text-align: center;">
                    If the button doesn't work, copy and paste this link into your browser:
                  </p>
                  <p style="font-size: 12px; line-height: 1.4; margin: 0; text-align: center; word-break: break-all;">
                    <a href="${verificationLink}" style="color: #2563EB; text-decoration: underline;">${verificationLink}</a>
                  </p>
                </div>
                
                <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 32px 0 20px 0;">
                
                <p style="font-size: 12px; color: #94A3B8; text-align: center; line-height: 1.5; margin: 0;">
                  If you didn't create an account with EVOA, you can safely ignore this email.
                </p>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `;

      await this.dispatchEmail({
        from,
        to,
        subject: 'Verify your EVOA account',
        html: htmlContent,
      });
      this.logger.log(`[MailService] Verification email dispatched to ${to}`);
      return true;
    } catch (err: any) {
      this.logger.error(`[MailService] Failed to send verification email to ${to}: ${err.message}`);
      throw err;
    }
  }

  async sendEventPassEmail(params: {
    to: string;
    attendeeName: string;
    eventTitle: string;
    ticketCode: string;
    eventDate?: string;
    eventTime?: string;
    eventVenue?: string;
    userRole?: string;
    orderId?: string;
    paymentId?: string;
    price?: number;
    pdfBuffer: Buffer;
  }): Promise<boolean> {
    const {
      to,
      attendeeName,
      eventTitle,
      ticketCode,
      eventDate = 'Date Announced Soon',
      eventTime = 'Time TBA',
      eventVenue = 'Venue Details Announced Soon',
      userRole = 'ATTENDEE',
      pdfBuffer,
    } = params;

    const subject = `Your Event Pass for ${eventTitle} – EVOA`;
    const from = this.getFromAddress();
    const roleBadge = userRole.toUpperCase();

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Your Event Pass for ${eventTitle}</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F8FAFC; color: #0F172A; padding: 40px 20px; margin: 0;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; background-color: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 16px; box-shadow: 0 4px 24px rgba(15, 23, 42, 0.06); overflow: hidden;">
          <tr>
            <td style="padding: 40px 36px;">
              <!-- Brand Header -->
              <div style="text-align: center; margin-bottom: 24px;">
                <h1 style="font-size: 30px; font-weight: 800; letter-spacing: 0.5px; color: #0F172A; margin: 0;">
                  EVO<span style="color: #2563EB;">-A</span>
                </h1>
                <p style="font-family: 'SF Mono', Menlo, Consolas, Monaco, monospace; font-size: 10px; letter-spacing: 2.5px; color: #64748B; text-transform: uppercase; margin: 6px 0 0 0;">
                  Startup · Investor · Ecosystem
                </p>
              </div>

              <!-- Main Heading -->
              <div style="text-align: center; margin-bottom: 24px;">
                <div style="display: inline-block; background-color: #DCFCE7; color: #166534; font-weight: 700; font-size: 12px; letter-spacing: 0.5px; text-transform: uppercase; padding: 6px 14px; border-radius: 20px; margin-bottom: 12px;">
                  ✓ Payment & Registration Confirmed
                </div>
                <h2 style="font-size: 22px; font-weight: 700; color: #0F172A; margin: 0 0 8px 0;">
                  Your Event Pass is Ready!
                </h2>
                <p style="font-size: 15px; color: #475569; line-height: 1.6; margin: 0;">
                  Hi <strong>${attendeeName}</strong>, thank you for registering. Your ticket purchase for <strong>${eventTitle}</strong> has been successfully confirmed.
                </p>
              </div>

              <!-- Event Details Box -->
              <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 22px; margin: 24px 0;">
                <table width="100%" cellspacing="0" cellpadding="0" style="font-size: 14px;">
                  <tr>
                    <td style="padding-bottom: 12px; color: #64748B; font-weight: 600; width: 35%;">Event:</td>
                    <td style="padding-bottom: 12px; color: #0F172A; font-weight: 700;">${eventTitle}</td>
                  </tr>
                  <tr>
                    <td style="padding-bottom: 12px; color: #64748B; font-weight: 600;">Pass Code:</td>
                    <td style="padding-bottom: 12px; font-family: monospace; font-size: 15px; color: #2563EB; font-weight: 700;">${ticketCode}</td>
                  </tr>
                  <tr>
                    <td style="padding-bottom: 12px; color: #64748B; font-weight: 600;">Access Tier:</td>
                    <td style="padding-bottom: 12px; color: #0F172A; font-weight: 600;">${roleBadge}</td>
                  </tr>
                  <tr>
                    <td style="padding-bottom: 12px; color: #64748B; font-weight: 600;">Date & Time:</td>
                    <td style="padding-bottom: 12px; color: #0F172A; font-weight: 600;">${eventDate} • ${eventTime}</td>
                  </tr>
                  <tr>
                    <td style="color: #64748B; font-weight: 600;">Venue:</td>
                    <td style="color: #0F172A; font-weight: 600;">${eventVenue}</td>
                  </tr>
                </table>
              </div>

              <!-- Pass Attachment Notice (Blue Callout) -->
              <div style="background-color: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 10px; padding: 16px 18px; margin-bottom: 24px;">
                <p style="font-size: 14px; font-weight: 700; color: #1E40AF; margin: 0 0 4px 0;">
                  📎 Official Event Pass Attached (PDF)
                </p>
                <p style="font-size: 13px; color: #1E3A8A; line-height: 1.5; margin: 0;">
                  We have attached your official vector <strong>Event Pass (PDF)</strong> containing your unique QR entry code to this email. Please download or save the PDF on your device to show at the check-in desk at the entrance.
                </p>
              </div>

              <!-- Security Notice -->
              <div style="background-color: #F1F5F9; border-radius: 8px; padding: 12px 16px; margin-bottom: 24px;">
                <p style="font-size: 12px; color: #64748B; line-height: 1.5; margin: 0; text-align: center;">
                  🔒 This pass is uniquely registered to <strong>${attendeeName}</strong> (${to}) and is non-transferable.
                </p>
              </div>

              <!-- Footer -->
              <div style="text-align: center; border-top: 1px solid #E2E8F0; padding-top: 20px;">
                <p style="font-size: 12px; color: #94A3B8; margin: 0;">
                  Questions or need assistance? Contact our support team at <a href="mailto:admin@evoa.co.in" style="color: #2563EB; text-decoration: none;">admin@evoa.co.in</a>.
                </p>
                <p style="font-size: 11px; color: #CBD5E1; margin: 8px 0 0 0;">
                  © ${new Date().getFullYear()} EVOA Ecosystem. All rights reserved.
                </p>
              </div>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    try {
      await this.dispatchEmail({
        from,
        to,
        subject,
        html: htmlContent,
        attachments: [
          {
            filename: `EVOA_Pass_${ticketCode}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
          },
        ],
      });
      this.logger.log(`[MailService] Event Pass email successfully sent to ${to} for event "${eventTitle}" [Pass: ${ticketCode}]`);
      return true;
    } catch (err: any) {
      this.logger.error(`[MailService] Failed to send Event Pass email to ${to}: ${err?.message || err}`);
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
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Reset your EVOA Password</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F8FAFC; color: #0F172A; padding: 40px 20px; margin: 0;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 560px; margin: 0 auto; background-color: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 16px; box-shadow: 0 4px 24px rgba(15, 23, 42, 0.06); overflow: hidden;">
            <tr>
              <td style="padding: 40px 36px;">
                <!-- Brand Header -->
                <div style="text-align: center; margin-bottom: 28px;">
                  <h1 style="font-size: 30px; font-weight: 800; letter-spacing: 0.5px; color: #0F172A; margin: 0;">
                    EVO<span style="color: #2563EB;">-A</span>
                  </h1>
                  <p style="font-family: 'SF Mono', Menlo, Consolas, Monaco, monospace; font-size: 10px; letter-spacing: 2.5px; color: #64748B; text-transform: uppercase; margin: 6px 0 0 0;">
                    Startup · Investor · Ecosystem
                  </p>
                </div>
                
                <!-- Main Message -->
                <div style="text-align: center; margin-bottom: 28px;">
                  <h2 style="font-size: 22px; font-weight: 700; color: #0F172A; margin: 0 0 12px 0;">Reset Your Password</h2>
                  <p style="font-size: 15px; color: #475569; line-height: 1.6; margin: 0;">
                    We received a request to reset the password for your EVOA account. Click the button below to choose a new password.
                  </p>
                </div>
                
                <!-- Action Button -->
                <div style="text-align: center; margin: 32px 0;">
                  <a href="${resetLink}" style="background-color: #2563EB; color: #FFFFFF; text-decoration: none; padding: 14px 34px; font-weight: 600; font-size: 15px; letter-spacing: 0.3px; display: inline-block; border-radius: 10px; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.28);">
                    Reset Password
                  </a>
                </div>
                
                <!-- Fallback URL -->
                <div style="background-color: #F1F5F9; border-radius: 8px; padding: 14px 16px; margin-top: 28px;">
                  <p style="font-size: 12px; color: #64748B; line-height: 1.5; margin: 0 0 6px 0; text-align: center;">
                    If the button doesn't work, copy and paste this link into your browser:
                  </p>
                  <p style="font-size: 12px; line-height: 1.4; margin: 0; text-align: center; word-break: break-all;">
                    <a href="${resetLink}" style="color: #2563EB; text-decoration: underline;">${resetLink}</a>
                  </p>
                </div>
                
                <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 32px 0 20px 0;">
                
                <p style="font-size: 12px; color: #94A3B8; text-align: center; line-height: 1.5; margin: 0;">
                  If you didn't request a password reset, you can safely ignore this email.
                </p>
              </td>
            </tr>
          </table>
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
