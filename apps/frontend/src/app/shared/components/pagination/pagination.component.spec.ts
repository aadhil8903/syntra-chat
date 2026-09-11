import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PaginationComponent } from './pagination.component';

describe('PaginationComponent', () => {
  let component: PaginationComponent;
  let fixture: ComponentFixture<PaginationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PaginationComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(PaginationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create with default values', () => {
    expect(component).toBeTruthy();
    expect(component.currentPage).toBe(1);
    expect(component.pageSize).toBe(50);
    expect(component.totalItems).toBe(0);
    expect(component.pageSizeOptions).toEqual([10, 50, 'all']);
  });

  describe('calculations', () => {
    it('should calculate totalPages correctly', () => {
      component.totalItems = 0;
      component.pageSize = 50;
      expect(component.totalPages).toBe(1);

      component.totalItems = 45;
      component.pageSize = 50;
      expect(component.totalPages).toBe(1);

      component.totalItems = 51;
      component.pageSize = 50;
      expect(component.totalPages).toBe(2);

      component.totalItems = 120;
      component.pageSize = 10;
      expect(component.totalPages).toBe(12);

      component.pageSize = 'all';
      expect(component.totalPages).toBe(1);
    });

    it('should calculate startItem and endItem correctly', () => {
      component.totalItems = 0;
      component.pageSize = 50;
      component.currentPage = 1;
      expect(component.startItem).toBe(0);
      expect(component.endItem).toBe(0);

      component.totalItems = 124;
      component.pageSize = 50;
      component.currentPage = 1;
      expect(component.startItem).toBe(1);
      expect(component.endItem).toBe(50);

      component.currentPage = 3;
      expect(component.startItem).toBe(101);
      expect(component.endItem).toBe(124);

      component.pageSize = 'all';
      expect(component.startItem).toBe(1);
      expect(component.endItem).toBe(124);
    });

    it('should generate page numbers correctly without ellipsis when totalPages <= 7', () => {
      component.totalItems = 45;
      component.pageSize = 10; // 5 pages
      component.currentPage = 1;
      expect(component.pages).toEqual([1, 2, 3, 4, 5]);
    });

    it('should generate page numbers with ellipsis when near start', () => {
      component.totalItems = 100;
      component.pageSize = 10; // 10 pages
      component.currentPage = 2;
      expect(component.pages).toEqual([1, 2, 3, 4, 5, '...', 10]);
    });

    it('should generate page numbers with ellipsis when near end', () => {
      component.totalItems = 100;
      component.pageSize = 10; // 10 pages
      component.currentPage = 9;
      expect(component.pages).toEqual([1, '...', 6, 7, 8, 9, 10]);
    });

    it('should generate page numbers with ellipsis on both sides when in middle', () => {
      component.totalItems = 100;
      component.pageSize = 10; // 10 pages
      component.currentPage = 6;
      expect(component.pages).toEqual([1, '...', 5, 6, 7, '...', 10]);
    });
  });

  describe('interactions and events', () => {
    it('should emit pageChange when onPageSelect is called with valid new page', () => {
      jest.spyOn(component.pageChange, 'emit');
      component.totalItems = 100;
      component.pageSize = 10;
      component.currentPage = 1;

      component.onPageSelect(3);
      expect(component.pageChange.emit).toHaveBeenCalledWith(3);

      // Should not emit for active page
      (component.pageChange.emit as jest.Mock).mockClear();
      component.onPageSelect(1);
      expect(component.pageChange.emit).not.toHaveBeenCalled();

      // Should not emit for ellipsis
      component.onPageSelect('...');
      expect(component.pageChange.emit).not.toHaveBeenCalled();
    });

    it('should emit pageChange on onPrev and onNext within bounds', () => {
      jest.spyOn(component.pageChange, 'emit');
      component.totalItems = 100;
      component.pageSize = 10; // 10 pages

      // At page 1, onPrev should not emit
      component.currentPage = 1;
      component.onPrev();
      expect(component.pageChange.emit).not.toHaveBeenCalled();

      // At page 1, onNext should emit 2
      component.onNext();
      expect(component.pageChange.emit).toHaveBeenCalledWith(2);

      // At page 10, onNext should not emit
      (component.pageChange.emit as jest.Mock).mockClear();
      component.currentPage = 10;
      component.onNext();
      expect(component.pageChange.emit).not.toHaveBeenCalled();

      // At page 10, onPrev should emit 9
      component.onPrev();
      expect(component.pageChange.emit).toHaveBeenCalledWith(9);
    });

    it('should emit pageSizeChange when a different page size is selected', () => {
      jest.spyOn(component.pageSizeChange, 'emit');
      component.pageSize = 50;

      component.onPageSizeSelect(10);
      expect(component.pageSizeChange.emit).toHaveBeenCalledWith(10);

      (component.pageSizeChange.emit as jest.Mock).mockClear();
      component.onPageSizeSelect(50); // Same page size
      expect(component.pageSizeChange.emit).not.toHaveBeenCalled();

      component.onPageSizeSelect('all');
      expect(component.pageSizeChange.emit).toHaveBeenCalledWith('all');
    });
  });

  describe('DOM rendering', () => {
    it('should render correct summary text', () => {
      fixture.componentRef.setInput('totalItems', 124);
      fixture.componentRef.setInput('pageSize', 50);
      fixture.componentRef.setInput('currentPage', 1);
      fixture.componentRef.setInput('itemLabel', 'files');
      fixture.detectChanges();

      const summaryEl = fixture.nativeElement.querySelector('.pagination-summary');
      expect(summaryEl.textContent.trim().replace(/\s+/g, ' ')).toContain('Showing 1–50 of 124 files');
    });
  });
});
