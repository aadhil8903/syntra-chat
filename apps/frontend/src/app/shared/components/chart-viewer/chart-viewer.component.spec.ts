import { ChartViewerComponent } from './chart-viewer.component';
import { IChartSpec, ChartType } from '@enter-chat/shared-types';

describe('ChartViewerComponent', () => {
  let component: ChartViewerComponent;

  beforeEach(() => {
    component = new ChartViewerComponent();
  });

  it('should initialize with default activeType LINE', () => {
    expect(component.activeType).toBe(ChartType.LINE);
  });

  it('should switch chart type correctly', () => {
    component.switchChartType(ChartType.LINE);
    expect(component.activeType).toBe(ChartType.LINE);

    component.switchChartType(ChartType.PIE);
    expect(component.activeType).toBe(ChartType.PIE);

    component.switchChartType(ChartType.DOUGHNUT);
    expect(component.activeType).toBe(ChartType.DOUGHNUT);
  });

  it('should accept valid chart spec with labels and datasets', () => {
    const mockSpec: IChartSpec = {
      type: ChartType.BAR,
      title: 'Quarterly Revenue Breakdown',
      description: 'Q1-Q4 comparison across product lines',
      data: {
        labels: ['Q1', 'Q2', 'Q3', 'Q4'],
        datasets: [
          {
            label: 'Hardware',
            data: [120, 150, 180, 210],
          },
          {
            label: 'Software',
            data: [90, 110, 140, 160],
          },
        ],
      },
    };

    component.chartSpec = mockSpec;
    expect(component.chartSpec.title).toBe('Quarterly Revenue Breakdown');
    expect(component.chartSpec.data.labels.length).toBe(4);
    expect(component.chartSpec.data.datasets.length).toBe(2);
  });
});
