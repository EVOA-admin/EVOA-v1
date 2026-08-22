import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import * as QRCode from 'qrcode';

export interface EventPassData {
    ticketCode: string;
    userName: string;
    userEmail: string;
    userRole: string;
    eventTitle: string;
    eventDate: string;
    eventTime: string;
    eventVenue: string;
    eventCity?: string;
    orderId?: string;
    paymentId?: string;
    price?: number;
    qrCodeData?: string;
}

@Injectable()
export class EventPassPdfService {
    private readonly logger = new Logger(EventPassPdfService.name);

    async generatePassPdf(data: EventPassData): Promise<Buffer> {
        return new Promise<Buffer>(async (resolve, reject) => {
            try {
                // Generate high-resolution QR code buffer
                const qrContent = data.qrCodeData || `EVOA OFFICIAL EVENT PASS\nName: ${data.userName}\nEmail: ${data.userEmail || 'N/A'}\nRole: ${data.userRole || 'ATTENDEE'}\nEvent: ${data.eventTitle}\nPass Code: ${data.ticketCode}`;
                const qrBuffer = await QRCode.toBuffer(qrContent, {
                    width: 220,
                    margin: 1,
                    color: {
                        dark: '#0F172A',
                        light: '#FFFFFF',
                    },
                });

                // Standard ticket pass dimensions (Width: 420pt, Height: 640pt)
                const doc = new PDFDocument({
                    size: [420, 640],
                    margins: { top: 0, bottom: 0, left: 0, right: 0 },
                });

                const buffers: Buffer[] = [];
                doc.on('data', (chunk) => buffers.push(chunk));
                doc.on('end', () => resolve(Buffer.concat(buffers)));
                doc.on('error', (err) => reject(err));

                // ── 1. BACKGROUND CANVAS ─────────────────────────────────────────────
                doc.rect(0, 0, 420, 640).fill('#0F172A');

                // ── 2. HEADER ACCENT BAR ─────────────────────────────────────────────
                doc.rect(0, 0, 420, 80).fill('#1E293B');

                // Top EVOA Brand Logo
                doc.fontSize(22).font('Helvetica-Bold').fillColor('#FFFFFF').text('EVO', 30, 24, { continued: true });
                doc.fillColor('#3B82F6').text('-A');
                doc.fontSize(8).font('Helvetica').fillColor('#94A3B8').text('STARTUP · INVESTOR · ECOSYSTEM', 30, 50, { characterSpacing: 1.5 });

                // Pass Badge (Top Right)
                doc.roundedRect(280, 26, 110, 28, 6).fill('#2563EB');
                doc.fontSize(10).font('Helvetica-Bold').fillColor('#FFFFFF').text('EVENT PASS', 280, 35, { width: 110, align: 'center' });

                // ── 3. EVENT TITLE & BADGE ──────────────────────────────────────────
                doc.fontSize(18).font('Helvetica-Bold').fillColor('#F8FAFC').text(data.eventTitle || 'EVOA Exclusive Event', 30, 105, { width: 360 });

                // Access Tier / Role Tag
                const roleBadge = (data.userRole || 'ATTENDEE').toUpperCase();
                doc.roundedRect(30, 142, 100, 20, 4).fill('#334155');
                doc.fontSize(9).font('Helvetica-Bold').fillColor('#38BDF8').text(roleBadge, 30, 147, { width: 100, align: 'center', characterSpacing: 1 });

                // ── 4. EVENT DETAILS GRID (CARD) ────────────────────────────────────
                doc.roundedRect(30, 175, 360, 130, 10).fill('#1E293B');

                // Column 1: Date & Time
                doc.fontSize(8).font('Helvetica-Bold').fillColor('#94A3B8').text('DATE & TIME', 45, 190, { characterSpacing: 1 });
                doc.fontSize(11).font('Helvetica-Bold').fillColor('#FFFFFF').text(data.eventDate || 'Date Announced Soon', 45, 204);
                doc.fontSize(9).font('Helvetica').fillColor('#CBD5E1').text(data.eventTime || 'Time TBA', 45, 220);

                // Column 2: Venue / Location
                doc.fontSize(8).font('Helvetica-Bold').fillColor('#94A3B8').text('VENUE / LOCATION', 210, 190, { characterSpacing: 1 });
                doc.fontSize(11).font('Helvetica-Bold').fillColor('#FFFFFF').text(data.eventVenue || 'Venue Details TBA', 210, 204, { width: 165 });
                if (data.eventCity) {
                    doc.fontSize(9).font('Helvetica').fillColor('#CBD5E1').text(data.eventCity, 210, 220);
                }

                // Attendee Info Divider
                doc.moveTo(45, 245).lineTo(375, 245).strokeColor('#334155').lineWidth(1).stroke();

                // Attendee Name & Email
                doc.fontSize(8).font('Helvetica-Bold').fillColor('#94A3B8').text('ATTENDEE NAME', 45, 255, { characterSpacing: 1 });
                doc.fontSize(11).font('Helvetica-Bold').fillColor('#FFFFFF').text(data.userName || 'Attendee', 45, 268);

                doc.fontSize(8).font('Helvetica-Bold').fillColor('#94A3B8').text('EMAIL ADDRESS', 210, 255, { characterSpacing: 1 });
                doc.fontSize(10).font('Helvetica').fillColor('#CBD5E1').text(data.userEmail || 'N/A', 210, 269, { width: 165 });

                // ── 5. TICKET CODE & PERFORATION LINE ───────────────────────────────
                doc.moveTo(20, 325).lineTo(400, 325).dash(4, { space: 4 }).strokeColor('#475569').lineWidth(1).stroke();
                doc.undash();

                // Semi-circle cutouts on left and right borders for ticket feel
                doc.circle(0, 325, 12).fill('#0B132B');
                doc.circle(420, 325, 12).fill('#0B132B');

                // ── 6. QR CODE & VERIFICATION SECTION ───────────────────────────────
                doc.roundedRect(30, 345, 360, 230, 10).fill('#FFFFFF');

                // Embed QR code inside the white card
                doc.image(qrBuffer, 140, 360, { width: 140, height: 140 });

                // Pass Code Badge Under QR
                doc.fontSize(8).font('Helvetica-Bold').fillColor('#64748B').text('OFFICIAL PASS CODE', 45, 510, { width: 330, align: 'center', characterSpacing: 1.5 });
                doc.fontSize(14).font('Helvetica-Bold').fillColor('#0F172A').text(data.ticketCode, 45, 524, { width: 330, align: 'center', characterSpacing: 1 });

                // Order / Payment Ref if available
                if (data.orderId || data.paymentId) {
                    const refText = data.paymentId ? `Payment ID: ${data.paymentId}` : `Order ID: ${data.orderId}`;
                    doc.fontSize(8).font('Helvetica').fillColor('#94A3B8').text(refText, 45, 545, { width: 330, align: 'center' });
                }

                // ── 7. FOOTER ENTRY INSTRUCTIONS ────────────────────────────────────
                doc.fontSize(8).font('Helvetica').fillColor('#64748B').text(
                    'Please present this digital or printed pass with QR code at the check-in desk for entry.',
                    30,
                    590,
                    { width: 360, align: 'center', lineGap: 2 },
                );
                doc.fontSize(7).font('Helvetica').fillColor('#475569').text(
                    '© EVOA Ecosystem · All Rights Reserved · Non-Transferable',
                    30,
                    616,
                    { width: 360, align: 'center' },
                );

                doc.end();
            } catch (err) {
                this.logger.error('Failed to generate Event Pass PDF:', err);
                reject(err);
            }
        });
    }
}
