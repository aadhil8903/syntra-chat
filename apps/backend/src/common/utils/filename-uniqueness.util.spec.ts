import {
  computeUniqueFilename,
  parseFilenameParts,
  normalizeFolder,
  resolveUniqueFilenameForModel,
} from './filename-uniqueness.util';

describe('Filename Uniqueness Utility (Dynamic Duplicate Handling)', () => {
  describe('normalizeFolder', () => {
    it('should normalize root folder representations to empty string', () => {
      expect(normalizeFolder(undefined)).toBe('');
      expect(normalizeFolder(null)).toBe('');
      expect(normalizeFolder('')).toBe('');
      expect(normalizeFolder('   ')).toBe('');
      expect(normalizeFolder('/')).toBe('');
      expect(normalizeFolder('///')).toBe('');
      expect(normalizeFolder('\\')).toBe('');
    });

    it('should strip leading and trailing slashes from folder paths', () => {
      expect(normalizeFolder('/Sales')).toBe('Sales');
      expect(normalizeFolder('Sales/')).toBe('Sales');
      expect(normalizeFolder('/Sales/Q1/')).toBe('Sales/Q1');
      expect(normalizeFolder('\\Engineering\\Docs\\')).toBe('Engineering\\Docs');
    });
  });

  describe('parseFilenameParts', () => {
    it('should parse standard filename with extension', () => {
      const parts = parseFilenameParts('report.pdf');
      expect(parts).toEqual({
        base: 'report',
        stem: 'report',
        initialSuffix: null,
        ext: '.pdf',
      });
    });

    it('should parse filename with multiple dots', () => {
      const parts = parseFilenameParts('financial.report.2026.xlsx');
      expect(parts).toEqual({
        base: 'financial.report.2026',
        stem: 'financial.report.2026',
        initialSuffix: null,
        ext: '.xlsx',
      });
    });

    it('should parse filename without extension', () => {
      const parts = parseFilenameParts('README');
      expect(parts).toEqual({
        base: 'README',
        stem: 'README',
        initialSuffix: null,
        ext: '',
      });
    });

    it('should parse filename with existing numeric suffix in parentheses', () => {
      const parts = parseFilenameParts('report (2).pdf');
      expect(parts).toEqual({
        base: 'report (2)',
        stem: 'report',
        initialSuffix: 2,
        ext: '.pdf',
      });
    });

    it('should parse filename with non-numeric parentheses as part of the stem', () => {
      const parts = parseFilenameParts('report (final).pdf');
      expect(parts).toEqual({
        base: 'report (final)',
        stem: 'report (final)',
        initialSuffix: null,
        ext: '.pdf',
      });
    });
  });

  describe('computeUniqueFilename', () => {
    // 1. First upload: report.pdf -> report.pdf
    it('1. should keep original filename when no file exists in folder', () => {
      const result = computeUniqueFilename('report.pdf', []);
      expect(result).toBe('report.pdf');
    });

    // 2. Duplicate: report.pdf -> report (1).pdf
    it('2. should append (1) on first duplicate collision', () => {
      const result = computeUniqueFilename('report.pdf', ['report.pdf']);
      expect(result).toBe('report (1).pdf');
    });

    // 3. Third duplicate: report.pdf -> report (2).pdf
    it('3. should generate (2) when report.pdf and report (1).pdf exist', () => {
      const result = computeUniqueFilename('report.pdf', [
        'report.pdf',
        'report (1).pdf',
      ]);
      expect(result).toBe('report (2).pdf');
    });

    // 4. Existing gaps: report.pdf, report (1).pdf, report (3).pdf -> report (2).pdf
    it('4. should fill the lowest numeric gap (e.g. 2 when 1 and 3 exist)', () => {
      const result = computeUniqueFilename('report.pdf', [
        'report.pdf',
        'report (1).pdf',
        'report (3).pdf',
      ]);
      expect(result).toBe('report (2).pdf');
    });

    // 5. Multiple duplicates: report.pdf, report (1..3).pdf -> report (4).pdf
    it('5. should increment to next integer when 1, 2, 3 all exist', () => {
      const result = computeUniqueFilename('report.pdf', [
        'report.pdf',
        'report (1).pdf',
        'report (2).pdf',
        'report (3).pdf',
      ]);
      expect(result).toBe('report (4).pdf');
    });

    // 6. Different extensions: report.pdf vs report.xlsx
    it('6. should allow files with different extensions to coexist without collision', () => {
      const result = computeUniqueFilename('report.xlsx', ['report.pdf']);
      expect(result).toBe('report.xlsx');
    });

    // 7. Filename containing multiple dots: financial.report.2026.xlsx
    it('7. should correctly place suffix before extension when filename has multiple dots', () => {
      const result = computeUniqueFilename('financial.report.2026.xlsx', [
        'financial.report.2026.xlsx',
      ]);
      expect(result).toBe('financial.report.2026 (1).xlsx');
    });

    // 8. Filename without extension
    it('8. should append suffix when file has no extension', () => {
      const result = computeUniqueFilename('README', ['README']);
      expect(result).toBe('README (1)');
    });

    // 9. Existing filename containing non-numeric parentheses: report (final).pdf
    it('9. should handle non-numeric parentheses without stripping', () => {
      const result = computeUniqueFilename('report (final).pdf', [
        'report (final).pdf',
      ]);
      expect(result).toBe('report (final) (1).pdf');
    });

    // 10. Filename already containing a numeric suffix: report (2).pdf
    it('10. should keep report (2).pdf if no collision exists', () => {
      const result = computeUniqueFilename('report (2).pdf', ['report.pdf']);
      expect(result).toBe('report (2).pdf');
    });

    it('10b. should not create malformed report (2) (1).pdf on collision', () => {
      const result = computeUniqueFilename('report (2).pdf', [
        'report (2).pdf',
      ]);
      // Lowest available suffix for stem "report" is 1
      expect(result).toBe('report (1).pdf');
    });

    it('10c. should find next suffix for numeric-suffixed upload when 1 and 2 exist', () => {
      const result = computeUniqueFilename('report (2).pdf', [
        'report.pdf',
        'report (1).pdf',
        'report (2).pdf',
      ]);
      expect(result).toBe('report (3).pdf');
    });

    // 11. Large gaps: report.pdf and report (7).pdf exist
    it('11. should pick (1) when only base and high index exist', () => {
      const result = computeUniqueFilename('report.pdf', [
        'report.pdf',
        'report (7).pdf',
      ]);
      expect(result).toBe('report (1).pdf');
    });

    // 12. Case sensitivity: Report.pdf collides with report.pdf
    it('12. should perform case-insensitive collision check and assign unique suffix', () => {
      const result = computeUniqueFilename('report.pdf', ['Report.pdf']);
      expect(result).toBe('report (1).pdf');
    });

    it('12b. should detect collision between uppercase and lowercase duplicates', () => {
      const result = computeUniqueFilename('REPORT.PDF', [
        'report.pdf',
        'Report (1).pdf',
      ]);
      expect(result).toBe('REPORT (2).PDF');
    });

    // 13. Sequential 4 uploads of 11_sales_pipeline.xlsx
    it('13. should produce sequential numbering for 4 identical uploads', () => {
      const existing: string[] = [];

      const upload1 = computeUniqueFilename('11_sales_pipeline.xlsx', existing);
      expect(upload1).toBe('11_sales_pipeline.xlsx');
      existing.push(upload1);

      const upload2 = computeUniqueFilename('11_sales_pipeline.xlsx', existing);
      expect(upload2).toBe('11_sales_pipeline (1).xlsx');
      existing.push(upload2);

      const upload3 = computeUniqueFilename('11_sales_pipeline.xlsx', existing);
      expect(upload3).toBe('11_sales_pipeline (2).xlsx');
      existing.push(upload3);

      const upload4 = computeUniqueFilename('11_sales_pipeline.xlsx', existing);
      expect(upload4).toBe('11_sales_pipeline (3).xlsx');
      existing.push(upload4);
    });
  });

  describe('resolveUniqueFilenameForModel', () => {
    it('should query model with folder and candidate regex and return unique filename', async () => {
      const mockDocs = [
        { originalName: '11_sales_pipeline.xlsx' },
        { originalName: '11_sales_pipeline (1).xlsx' },
      ];

      const mockModel: any = {
        find: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            lean: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue(mockDocs),
            }),
          }),
        }),
      };

      const result = await resolveUniqueFilenameForModel(
        mockModel,
        '11_sales_pipeline.xlsx',
        'Sales/Q1',
      );

      expect(result).toBe('11_sales_pipeline (2).xlsx');
      expect(mockModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          folder: 'Sales/Q1',
        }),
      );
    });

    it('should isolate by folder so same filename in different folders is permitted', async () => {
      // In Folder B, no documents exist
      const mockModel: any = {
        find: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            lean: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
      };

      const result = await resolveUniqueFilenameForModel(
        mockModel,
        'report.pdf',
        'Folder B',
      );

      expect(result).toBe('report.pdf');
      expect(mockModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          folder: 'Folder B',
        }),
      );
    });

    it('should exclude specified document ID when updating/moving', async () => {
      const mockModel: any = {
        find: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            lean: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
      };

      await resolveUniqueFilenameForModel(
        mockModel,
        'report.pdf',
        'Folder A',
        'doc-123-id',
      );

      expect(mockModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          folder: 'Folder A',
          _id: { $ne: 'doc-123-id' },
        }),
      );
    });
  });
});
