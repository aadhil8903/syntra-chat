import {
  Component,
  Input,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnChanges,
  SimpleChanges,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IChartSpec, ChartType } from '@enter-chat/shared-types';
import {
  Chart,
  registerables,
  ChartConfiguration,
} from 'chart.js';
import jsPDF from 'jspdf';

Chart.register(...registerables);

@Component({
  selector: 'app-chart-viewer',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (chartSpec) {
      <div class="my-4 p-5 rounded-2xl border border-[#27272a] bg-[#111114] space-y-3">
        <!-- Header & Controls -->
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-[#27272a] pb-3">
          <div>
            <h4 class="text-sm font-semibold text-white tracking-tight">{{ chartSpec.title }}</h4>
            @if (chartSpec.description) {
              <p class="text-xs text-[#a1a1aa] mt-0.5">{{ chartSpec.description }}</p>
            }
          </div>

          <!-- Dynamic Controls: Switch Chart Type & Export -->
          <div class="flex flex-wrap items-center gap-2">
            <!-- Chart Type Selector Pills -->
            <div class="flex bg-[#0c0c0e] p-1 rounded-xl border border-[#27272a] text-[11px] font-mono">
              <button
                (click)="switchChartType(ChartType.BAR)"
                [ngClass]="activeType === ChartType.BAR ? 'bg-white text-black font-bold' : 'text-[#a1a1aa] hover:text-white'"
                class="px-2 py-1 rounded-lg transition-colors"
                title="Bar Chart"
              >
                Bar
              </button>
              <button
                (click)="switchChartType(ChartType.LINE)"
                [ngClass]="activeType === ChartType.LINE ? 'bg-white text-black font-bold' : 'text-[#a1a1aa] hover:text-white'"
                class="px-2 py-1 rounded-lg transition-colors"
                title="Line Chart"
              >
                Line
              </button>
              <button
                (click)="switchChartType(ChartType.AREA)"
                [ngClass]="activeType === ChartType.AREA ? 'bg-white text-black font-bold' : 'text-[#a1a1aa] hover:text-white'"
                class="px-2 py-1 rounded-lg transition-colors"
                title="Area Chart"
              >
                Area
              </button>
              <button
                (click)="switchChartType(ChartType.PIE)"
                [ngClass]="activeType === ChartType.PIE ? 'bg-white text-black font-bold' : 'text-[#a1a1aa] hover:text-white'"
                class="px-2 py-1 rounded-lg transition-colors"
                title="Pie Chart"
              >
                Pie
              </button>
              <button
                (click)="switchChartType(ChartType.DOUGHNUT)"
                [ngClass]="activeType === ChartType.DOUGHNUT ? 'bg-white text-black font-bold' : 'text-[#a1a1aa] hover:text-white'"
                class="px-2 py-1 rounded-lg transition-colors"
                title="Doughnut Chart"
              >
                Donut
              </button>
            </div>

            <!-- Export Actions -->
            <button
              (click)="downloadChartAsPdf()"
              class="px-2.5 py-1.5 rounded-xl bg-[#18181b] hover:bg-[#27272a] text-white text-xs font-medium border border-[#3f3f46] flex items-center gap-1.5 transition-all"
              title="Download as PDF"
            >
              <svg class="w-3.5 h-3.5 text-zinc-400" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>PDF</span>
            </button>
          </div>
        </div>

        <!-- Canvas Container -->
        <div class="relative h-64 sm:h-80 w-full pt-2">
          <canvas #chartCanvas></canvas>
        </div>
      </div>
    }
  `,
})
export class ChartViewerComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() chartSpec?: IChartSpec;
  @ViewChild('chartCanvas') canvasRef?: ElementRef<HTMLCanvasElement>;

  ChartType = ChartType;
  activeType: ChartType = ChartType.LINE;
  private chartInstance?: Chart;

  // Fixed distinct solid/flat palette: distinct colors per category/series
  private readonly flatColors = [
    '#3b82f6', // Clean Blue
    '#10b981', // Clean Emerald
    '#f59e0b', // Clean Amber
    '#f43f5e', // Clean Rose / Coral
    '#8b5cf6', // Clean Violet
    '#06b6d4', // Clean Cyan
    '#ec4899', // Clean Pink
    '#64748b', // Clean Slate
    '#84cc16', // Clean Lime
    '#d946ef', // Clean Fuchsia
  ];

  ngAfterViewInit(): void {
    if (this.chartSpec) {
      this.activeType = this.chartSpec.chartType || ChartType.LINE;
    }
    this.renderChart();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['chartSpec']) {
      if (this.chartSpec) {
        this.activeType = this.chartSpec.chartType || ChartType.LINE;
      }
      this.renderChart();
    }
  }

  ngOnDestroy(): void {
    if (this.chartInstance) {
      this.chartInstance.destroy();
    }
  }

  switchChartType(type: ChartType): void {
    this.activeType = type;
    this.renderChart();
  }

  downloadChartAsPdf(): void {
    if (!this.canvasRef) return;
    const canvas = this.canvasRef.nativeElement;
    const imgData = canvas.toDataURL('image/png');

    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'px',
      format: [canvas.width, canvas.height + 80],
    });

    pdf.setFillColor(17, 17, 20); // #111114 obsidian background
    pdf.rect(0, 0, canvas.width, canvas.height + 80, 'F');

    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(16);
    pdf.text(this.chartSpec?.title || 'Data Visualization', 20, 30);

    if (this.chartSpec?.description) {
      pdf.setTextColor(161, 161, 170);
      pdf.setFontSize(10);
      pdf.text(this.chartSpec.description, 20, 48);
    }

    pdf.addImage(imgData, 'PNG', 0, 60, canvas.width, canvas.height);
    pdf.save(`${(this.chartSpec?.title || 'chart').toLowerCase().replace(/\s+/g, '_')}.pdf`);
  }

  private renderChart(): void {
    if (!this.canvasRef || !this.chartSpec) return;

    if (this.chartInstance) {
      this.chartInstance.destroy();
    }

    const ctx = this.canvasRef.nativeElement.getContext('2d');
    if (!ctx) return;

    const type = this.mapChartType(this.activeType);
    const seriesList = this.chartSpec.series || [];
    const labels = this.chartSpec.labels || [];
    const hasMultipleSeries = seriesList.length > 1;

    const datasets = seriesList.map((s, idx) => {
      const seriesColor = this.flatColors[idx % this.flatColors.length];
      const isArea = this.activeType === ChartType.AREA;
      const isBar = this.activeType === ChartType.BAR;

      // 1. Pie & Doughnut: each slice gets a distinct flat color
      if (type === 'pie' || type === 'doughnut') {
        const sliceColors = labels.map(
          (_, lIdx) => this.flatColors[lIdx % this.flatColors.length]
        );
        return {
          label: s.name,
          data: s.data,
          backgroundColor: sliceColors,
          borderColor: '#111114',
          borderWidth: 2,
          hoverOffset: 4,
        };
      }

      // 2. Bar Chart: if single series, color each bar with distinct category color; if multiple series, color per series
      let barBgColors: string | string[] = seriesColor;
      let barBorderColors: string | string[] = seriesColor;
      if (isBar && !hasMultipleSeries) {
        barBgColors = labels.map(
          (_, lIdx) => this.flatColors[lIdx % this.flatColors.length]
        );
        barBorderColors = barBgColors;
      }

      // 3. Line & Area: clean solid lines, flat subtle opacity fill for area
      return {
        label: s.name,
        data: s.data,
        backgroundColor: isArea
          ? `${seriesColor}25` // Flat 15% opacity tint, no gradients
          : isBar
          ? barBgColors
          : seriesColor,
        borderColor: isBar ? barBorderColors : seriesColor,
        borderWidth: isBar ? 0 : 2,
        fill: isArea,
        tension: 0.2, // Subtle curve
        pointBackgroundColor: seriesColor,
        pointBorderColor: '#111114',
        pointBorderWidth: 1.5,
        pointRadius: 4,
        pointHoverRadius: 6,
        borderRadius: isBar ? 4 : 0, // Clean subtle top corners on flat bars
      };
    });

    const config: ChartConfiguration = {
      type: type as any,
      data: {
        labels,
        datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 350,
          easing: 'easeOutQuad',
        },
        plugins: {
          legend: {
            display: hasMultipleSeries || type === 'pie' || type === 'doughnut',
            position: 'top',
            labels: {
              color: '#a1a1aa',
              font: { family: 'Inter', size: 11, weight: 500 },
              usePointStyle: true,
              pointStyle: 'circle',
              padding: 14,
            },
          },
          tooltip: {
            backgroundColor: '#18181b',
            titleColor: '#ffffff',
            bodyColor: '#a1a1aa',
            borderColor: '#27272a',
            borderWidth: 1,
            padding: 10,
            cornerRadius: 8,
            boxPadding: 4,
            usePointStyle: true,
          },
        },
        scales:
          type === 'pie' || type === 'doughnut'
            ? {}
            : {
                x: {
                  grid: { color: 'rgba(255, 255, 255, 0.04)' },
                  ticks: { color: '#a1a1aa', font: { size: 10 } },
                  title: this.chartSpec.xAxisLabel
                    ? { display: true, text: this.chartSpec.xAxisLabel, color: '#d4d4d8' }
                    : undefined,
                },
                y: {
                  grid: { color: 'rgba(255, 255, 255, 0.04)' },
                  ticks: { color: '#a1a1aa', font: { size: 10 } },
                  title: this.chartSpec.yAxisLabel
                    ? { display: true, text: this.chartSpec.yAxisLabel, color: '#d4d4d8' }
                    : undefined,
                },
              },
      },
    };

    this.chartInstance = new Chart(ctx, config);
  }

  private mapChartType(type: ChartType): string {
    switch (type) {
      case ChartType.BAR:
        return 'bar';
      case ChartType.LINE:
      case ChartType.AREA:
        return 'line';
      case ChartType.PIE:
        return 'pie';
      case ChartType.DOUGHNUT:
        return 'doughnut';
      case ChartType.SCATTER:
        return 'scatter';
      default:
        return 'line';
    }
  }
}
