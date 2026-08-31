import { CitationBadgeComponent } from './citation-badge.component';

describe('CitationBadgeComponent', () => {
  let component: CitationBadgeComponent;

  beforeEach(() => {
    component = new CitationBadgeComponent();
  });

  it('should deduplicate multiple chunk citations for the same file', () => {
    component.citations = [
      {
        documentId: 'doc-1',
        filename: '11_sales_pipeline.xlsx',
        chunkIndex: 0,
        page: 1,
        sourceType: 'tabular',
        textSnippet: 'Revenue column preview',
        score: 0.9,
      },
      {
        documentId: 'doc-1',
        filename: '11_sales_pipeline.xlsx',
        chunkIndex: 1,
        page: 1,
        sourceType: 'tabular',
        textSnippet: 'Sales reps list',
        score: 0.85,
      },
      {
        documentId: 'doc-2',
        filename: '07_q1_2026_earnings_report.pdf',
        chunkIndex: 4,
        page: 2,
        sourceType: 'narrative',
        textSnippet: 'Quarterly EBITDA summary',
        score: 0.77,
      },
    ];

    expect(component.uniqueSourceFiles.length).toBe(2);
    expect(component.uniqueSourceFiles[0].filename).toBe('11_sales_pipeline.xlsx');
    expect(component.uniqueSourceFiles[0].textSnippets.length).toBe(2);
    expect(component.uniqueSourceFiles[1].filename).toBe('07_q1_2026_earnings_report.pdf');
  });

  it('should toggle expansion index', () => {
    expect(component.expandedIdx).toBeNull();
    component.toggleExpand(0);
    expect(component.expandedIdx).toBe(0);
    component.toggleExpand(0);
    expect(component.expandedIdx).toBeNull();
  });
});
