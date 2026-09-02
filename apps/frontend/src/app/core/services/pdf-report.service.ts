import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { IMessage } from '@enter-chat/shared-types';

@Injectable({
  providedIn: 'root',
})
export class PdfReportService {
  /**
   * Export a single AI analysis or calculation response as a standalone Executive PDF Report.
   */
  async exportMessageReport(
    message: IMessage,
    conversationTitle: string = 'Executive AI Report',
    visualElement?: HTMLElement | null
  ): Promise<void> {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 16;
    const contentWidth = pageWidth - margin * 2;
    let y = 18;

    // 1. Enterprise Branded Header
    doc.setFillColor(225, 29, 72); // Brand Red Top Accent Ribbon
    doc.rect(0, 0, pageWidth, 2.5, 'F');

    doc.setFillColor(9, 9, 11); // Dark Surface Banner (#09090b)
    doc.rect(0, 2.5, pageWidth, 26, 'F');

    // Title in Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.text('SYNTRA CHAT  |  EXECUTIVE INTELLIGENCE REPORT', margin, 13);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(203, 213, 225);
    const dateStr = new Date(message.createdAt || Date.now()).toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    doc.text(`Topic: ${conversationTitle.slice(0, 45)}   •   Generated: ${dateStr}`, margin, 20);

    y = 36;

    // If there's an attached chart or table visual, capture it via html2canvas
    if (visualElement) {
      try {
        const canvas = await html2canvas(visualElement, {
          scale: 2,
          backgroundColor: '#18181b',
          logging: false,
        });
        const imgData = canvas.toDataURL('image/png');
        const imgWidth = contentWidth;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        if (y + imgHeight > pageHeight - 25) {
          doc.addPage();
          y = 20;
        }

        // Draw a neat border container around the chart
        doc.setFillColor(24, 24, 27);
        doc.roundedRect(margin, y, imgWidth, imgHeight + 4, 3, 3, 'F');
        doc.addImage(imgData, 'PNG', margin + 2, y + 2, imgWidth - 4, imgHeight);
        y += imgHeight + 10;
      } catch (err) {
        console.warn('Could not capture visual element for PDF:', err);
      }
    }

    // 2. Structured Content Rendering
    const rawContent = message.content || '';
    const sections = rawContent.split('\n');

    for (let line of sections) {
      line = line.trim();
      if (!line) {
        y += 3;
        continue;
      }

      // Check page break
      if (y > pageHeight - 22) {
        this.addPageFooter(doc, pageWidth, pageHeight);
        doc.addPage();
        y = 20;
      }

      // Major Heading (### or ## or #)
      if (line.startsWith('#')) {
        const level = (line.match(/^#+/) || ['#'])[0].length;
        const text = line.replace(/^#+\s*/, '').replace(/[*_`]/g, '');

        y += 4;
        if (y > pageHeight - 22) {
          this.addPageFooter(doc, pageWidth, pageHeight);
          doc.addPage();
          y = 20;
        }

        doc.setFont('helvetica', 'bold');
        if (level === 1) {
          doc.setFontSize(13);
          doc.setTextColor(15, 23, 42);
          doc.text(text, margin, y);
          doc.setDrawColor(226, 232, 240);
          doc.setLineWidth(0.5);
          doc.line(margin, y + 2, pageWidth - margin, y + 2);
          y += 7;
        } else if (level === 2) {
          doc.setFontSize(11);
          doc.setTextColor(30, 41, 59);
          doc.text(text, margin, y);
          y += 5.5;
        } else {
          doc.setFontSize(10);
          doc.setTextColor(51, 65, 85);
          doc.text(text, margin, y);
          y += 5;
        }
      }
      // Bullet items (* or - or 1.)
      else if (/^(\*|-|\d+\.)\s+/.test(line)) {
        const bulletMatch = line.match(/^(\*|-|\d+\.)\s+/);
        const bulletPrefix = bulletMatch ? bulletMatch[0] : '• ';
        const cleanBody = line.replace(/^(\*|-|\d+\.)\s+/, '');

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(51, 65, 85);

        // Render bullet symbol
        doc.text('•', margin + 2, y);

        // Split text with bold recognition
        const plainText = cleanBody.replace(/[*_`]/g, '');
        const wrappedLines = doc.splitTextToSize(plainText, contentWidth - 8);

        for (let i = 0; i < wrappedLines.length; i++) {
          if (y > pageHeight - 22) {
            this.addPageFooter(doc, pageWidth, pageHeight);
            doc.addPage();
            y = 20;
          }
          doc.text(wrappedLines[i], margin + 7, y);
          y += 4.5;
        }
        y += 1;
      }
      // Standard Paragraph Text
      else {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(51, 65, 85);

        const cleanText = line.replace(/[*_`]/g, '');
        const wrappedLines = doc.splitTextToSize(cleanText, contentWidth);

        for (let i = 0; i < wrappedLines.length; i++) {
          if (y > pageHeight - 22) {
            this.addPageFooter(doc, pageWidth, pageHeight);
            doc.addPage();
            y = 20;
          }
          doc.text(wrappedLines[i], margin, y);
          y += 4.5;
        }
        y += 2;
      }
    }

    // Add footer to final page
    this.addPageFooter(doc, pageWidth, pageHeight);

    // Save with sanitized filename
    const safeTitle = (conversationTitle || 'AI_Report').replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 30);
    doc.save(`${safeTitle}_Report_${Date.now()}.pdf`);
  }

  /**
   * Export the complete conversation with full transcripts and timestamps.
   */
  exportFullConversation(
    messages: IMessage[],
    conversationTitle: string = 'Conversation'
  ): void {
    if (!messages || messages.length === 0) return;

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 16;
    const contentWidth = pageWidth - margin * 2;
    let y = 18;

    // Header Banner
    doc.setFillColor(225, 29, 72); // Brand Red Top Accent Ribbon
    doc.rect(0, 0, pageWidth, 2.5, 'F');

    doc.setFillColor(9, 9, 11); // Dark Surface Banner (#09090b)
    doc.rect(0, 2.5, pageWidth, 26, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.text('SYNTRA CHAT  |  CONVERSATION TRANSCRIPT', margin, 13);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(203, 213, 225);
    doc.text(`Thread: ${conversationTitle.slice(0, 45)}   •   Exported: ${new Date().toLocaleString()}`, margin, 20);

    y = 36;

    for (const msg of messages) {
      if (y > pageHeight - 30) {
        this.addPageFooter(doc, pageWidth, pageHeight);
        doc.addPage();
        y = 20;
      }

      // Sender badge
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      if (msg.role === 'user') {
        doc.setFillColor(239, 246, 255);
        doc.setDrawColor(191, 219, 254);
        doc.roundedRect(margin, y - 4, contentWidth, 7, 1.5, 1.5, 'FD');
        doc.setTextColor(29, 78, 216);
        doc.text('USER', margin + 3, y + 1);
      } else {
        doc.setFillColor(240, 253, 244);
        doc.setDrawColor(187, 247, 208);
        doc.roundedRect(margin, y - 4, contentWidth, 7, 1.5, 1.5, 'FD');
        doc.setTextColor(21, 128, 61);
        doc.text('SYNTRA CHAT AI', margin + 3, y + 1);
      }

      const timeStr = msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      if (timeStr) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text(timeStr, pageWidth - margin - 15, y + 1);
      }

      y += 8;

      // Message Body
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(51, 65, 85);

      const cleanContent = msg.content.replace(/[*_`#]/g, '');
      const lines = doc.splitTextToSize(cleanContent, contentWidth - 4);

      for (const line of lines) {
        if (y > pageHeight - 20) {
          this.addPageFooter(doc, pageWidth, pageHeight);
          doc.addPage();
          y = 20;
        }
        doc.text(line, margin + 2, y);
        y += 4.5;
      }

      y += 6;
    }

    this.addPageFooter(doc, pageWidth, pageHeight);

    const safeTitle = (conversationTitle || 'Chat').replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 30);
    doc.save(`${safeTitle}_Transcript_${Date.now()}.pdf`);
  }

  private addPageFooter(doc: jsPDF, pageWidth: number, pageHeight: number): void {
    const pageCount = (doc.internal as any).getNumberOfPages();
    const currentPage = (doc as any).internal.getCurrentPageInfo().pageNumber;

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(16, pageHeight - 12, pageWidth - 16, pageHeight - 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(`Page ${currentPage} of ${pageCount}`, pageWidth - 32, pageHeight - 7);
  }
}

