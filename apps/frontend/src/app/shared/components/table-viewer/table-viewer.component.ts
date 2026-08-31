import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ITableSpec } from '@enter-chat/shared-types';
import jsPDF from 'jspdf';

@Component({
  selector: 'app-table-viewer',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (table) {
      <div class="my-4 rounded-2xl border border-[#27272a] bg-[#111114] overflow-hidden shadow-xl">
        <div class="px-4 py-3 bg-[#141417] border-b border-[#27272a] flex items-center justify-between flex-wrap gap-2">
          <div class="flex items-center gap-2">
            <svg class="w-4 h-4 text-white" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span class="text-xs font-semibold text-white">{{ table.title || 'Data Table' }}</span>
            @if (table.totalRows) {
              <span class="text-[11px] text-[#71717a] font-mono">({{ table.totalRows }} rows)</span>
            }
          </div>

          <div class="flex items-center gap-2">
            <button
              (click)="downloadAsCsv()"
              class="px-2.5 py-1 rounded-lg bg-[#18181b] hover:bg-[#27272a] text-white text-xs font-medium border border-[#3f3f46] transition-colors"
              title="Download as CSV"
            >
              CSV
            </button>
            <button
              (click)="downloadAsPdf()"
              class="px-2.5 py-1 rounded-lg bg-[#18181b] hover:bg-[#27272a] text-white text-xs font-medium border border-[#3f3f46] flex items-center gap-1 transition-colors"
              title="Download as PDF"
            >
              <svg class="w-3 h-3 text-zinc-400" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              PDF
            </button>
          </div>
        </div>

        <div class="overflow-x-auto max-h-80">
          <table class="w-full text-left text-xs border-collapse">
            <thead>
              <tr class="border-b border-[#27272a] bg-[#0c0c0e] text-[#a1a1aa] font-medium">
                @for (col of table.columns; track col) {
                  <th class="px-3.5 py-2.5 whitespace-nowrap">{{ col }}</th>
                }
              </tr>
            </thead>
            <tbody class="divide-y divide-[#27272a] font-mono">
              @for (row of table.rows; track $index) {
                <tr class="hover:bg-[#18181b]/50 transition-colors">
                  @for (cell of row; track $index) {
                    <td class="px-3.5 py-2 text-[#fafafa] whitespace-nowrap">
                      {{ cell !== null && cell !== undefined ? cell : '-' }}
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    }
  `,
})
export class TableViewerComponent {
  @Input() table?: ITableSpec;

  downloadAsCsv(): void {
    if (!this.table) return;
    const header = this.table.columns.join(',');
    const rows = this.table.rows.map((r) =>
      r.map((c) => (c === null || c === undefined ? '' : `"${String(c).replace(/"/g, '""')}"`)).join(',')
    );
    const csvContent = [header, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${(this.table.title || 'table').toLowerCase().replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  downloadAsPdf(): void {
    if (!this.table) return;
    const pdf = new jsPDF();
    pdf.setFontSize(14);
    pdf.text(this.table.title || 'Data Table', 14, 15);
    pdf.setFontSize(9);

    let y = 25;
    const colWidth = 180 / Math.max(1, this.table.columns.length);

    // Headers
    pdf.setFont('helvetica', 'bold');
    this.table.columns.forEach((col, i) => {
      pdf.text(String(col).slice(0, 15), 14 + i * colWidth, y);
    });
    pdf.line(14, y + 2, 195, y + 2);
    y += 8;

    // Rows
    pdf.setFont('helvetica', 'normal');
    for (const row of this.table.rows.slice(0, 35)) {
      row.forEach((cell, i) => {
        const text = cell !== null && cell !== undefined ? String(cell).slice(0, 15) : '-';
        pdf.text(text, 14 + i * colWidth, y);
      });
      y += 6;
      if (y > 280) break;
    }

    pdf.save(`${(this.table.title || 'table').toLowerCase().replace(/\s+/g, '_')}.pdf`);
  }
}
