import { TableViewerComponent } from './table-viewer.component';
import { ITableSpec } from '@enter-chat/shared-types';

describe('TableViewerComponent', () => {
  let component: TableViewerComponent;

  beforeEach(() => {
    component = new TableViewerComponent();
  });

  it('should initialize with undefined table by default', () => {
    expect(component.table).toBeUndefined();
  });

  it('should receive and accept table spec with headers and rows', () => {
    const mockTable: ITableSpec = {
      title: 'Quarterly Financial Summary',
      columns: ['Quarter', 'Revenue', 'Operating Cost', 'Profit Margin'],
      rows: [
        ['Q1 2026', '$1,250,000', '$920,000', '26.4%'],
        ['Q2 2026', '$1,480,000', '$1,010,000', '31.7%'],
      ],
      totalRows: 2,
    };

    component.table = mockTable;
    expect(component.table.title).toBe('Quarterly Financial Summary');
    expect(component.table.columns.length).toBe(4);
    expect(component.table.rows.length).toBe(2);
    expect(component.table.totalRows).toBe(2);
  });

  it('should handle CSV generation for table data', () => {
    const mockTable: ITableSpec = {
      title: 'Products',
      columns: ['ID', 'Name', 'Price'],
      rows: [
        ['1', 'Enterprise Server', '$5000'],
        ['2', 'Cloud Storage, TB', '$120'], // Contains comma
      ],
      totalRows: 2,
    };

    component.table = mockTable;

    // Mock URL and document createElement
    const createObjectURLMock = jest.fn(() => 'blob:mock-url');
    window.URL.createObjectURL = createObjectURLMock;
    window.URL.revokeObjectURL = jest.fn();

    const linkMock = {
      setAttribute: jest.fn(),
      click: jest.fn(),
      style: {},
    };
    jest.spyOn(document, 'createElement').mockReturnValue(linkMock as any);
    jest.spyOn(document.body, 'appendChild').mockImplementation(() => linkMock as any);
    jest.spyOn(document.body, 'removeChild').mockImplementation(() => linkMock as any);

    component.downloadAsCsv();
    expect(createObjectURLMock).toHaveBeenCalled();
    expect(linkMock.click).toHaveBeenCalled();
  });
});
