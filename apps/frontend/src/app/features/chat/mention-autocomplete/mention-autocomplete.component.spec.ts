import { MentionAutocompleteComponent } from './mention-autocomplete.component';
import { IMentionOption, MentionResourceType } from '@enter-chat/shared-types';
import { SimpleChange, ElementRef } from '@angular/core';

describe('MentionAutocompleteComponent', () => {
  let component: MentionAutocompleteComponent;
  let mockElementRef: ElementRef;

  beforeEach(() => {
    mockElementRef = { nativeElement: document.createElement('div') } as ElementRef;
    component = new MentionAutocompleteComponent(mockElementRef);
  });

  it('should initialize with closed state and empty options', () => {
    expect(component.isOpen).toBe(false);
    expect(component.options).toEqual([]);
    expect(component.selectedIndex).toBe(0);
    expect(component.flatList).toEqual([]);
  });

  it('should group options dynamically into AI ASSISTANT, FILES & CONTEXT, and TEAM MEMBERS', () => {
    const options: IMentionOption[] = [
      { id: 'syntra-ai', name: 'Syntra AI', type: 'ai' as any },
      { id: 'folder-1', name: 'Finance Folder', type: MentionResourceType.FOLDER },
      { id: 'doc-2', name: 'policies.pdf', type: MentionResourceType.DOCUMENT, fileType: 'pdf' },
      { id: 'ds-3', name: 'sales.csv', type: MentionResourceType.DATASET, fileType: 'csv' },
      { id: 'user-4', name: 'Sarah Connor', type: 'user' as any, status: 'online' },
    ];
    component.options = options;

    const groups = component.displayGroups;
    expect(groups.length).toBe(3);

    expect(groups[0].title).toBe('AI ASSISTANT');
    expect(groups[0].items.length).toBe(1);
    expect(groups[0].items[0].name).toBe('Syntra AI');

    expect(groups[1].title).toBe('FILES & CONTEXT');
    expect(groups[1].items.length).toBe(3);
    expect(groups[1].items.map((i) => i.name)).toEqual(['Finance Folder', 'policies.pdf', 'sales.csv']);

    expect(groups[2].title).toBe('TEAM MEMBERS');
    expect(groups[2].items.length).toBe(1);
    expect(groups[2].items[0].name).toBe('Sarah Connor');

    expect(component.flatList.length).toBe(5);
  });

  it('should not create empty sections when only Syntra AI is present', () => {
    const options: IMentionOption[] = [
      { id: 'syntra-ai', name: 'Syntra AI', type: 'ai' as any },
    ];
    component.options = options;

    const groups = component.displayGroups;
    expect(groups.length).toBe(1);
    expect(groups[0].title).toBe('AI ASSISTANT');
    expect(groups.find((g) => g.title === 'FILES & CONTEXT')).toBeUndefined();
    expect(groups.find((g) => g.title === 'TEAM MEMBERS')).toBeUndefined();
  });

  it('should not create AI ASSISTANT section when filtering exclusively for documents', () => {
    const options: IMentionOption[] = [
      { id: 'doc-1', name: 'Financial_Report.pdf', type: MentionResourceType.DOCUMENT, fileType: 'pdf' },
    ];
    component.options = options;

    const groups = component.displayGroups;
    expect(groups.length).toBe(1);
    expect(groups[0].title).toBe('FILES & CONTEXT');
    expect(groups.find((g) => g.title === 'AI ASSISTANT')).toBeUndefined();
  });

  it('should emit optionSelected event when an option is picked', () => {
    const selectedOption: IMentionOption = {
      id: 'doc-1',
      name: 'q1_report.pdf',
      type: MentionResourceType.DOCUMENT,
      fileType: 'pdf',
    };

    let emitted: IMentionOption | undefined;
    component.optionSelected.subscribe((val) => {
      emitted = val;
    });

    component.selectOption(selectedOption);
    expect(emitted).toEqual(selectedOption);
  });

  it('should handle keyboard navigation across grouped items: ArrowDown, ArrowUp, Enter, and Escape', () => {
    component.isOpen = true;
    component.options = [
      { id: 'syntra-ai', name: 'Syntra AI', type: 'ai' as any },
      { id: 'doc-1', name: 'File 1', type: MentionResourceType.DOCUMENT },
    ];

    expect(component.flatList.length).toBe(2);

    const arrowDownEvent = { key: 'ArrowDown', preventDefault: jest.fn() } as unknown as KeyboardEvent;
    component.handleKeyDown(arrowDownEvent);
    expect(component.selectedIndex).toBe(1);

    const arrowUpEvent = { key: 'ArrowUp', preventDefault: jest.fn() } as unknown as KeyboardEvent;
    component.handleKeyDown(arrowUpEvent);
    expect(component.selectedIndex).toBe(0);

    let emittedOption: IMentionOption | undefined;
    component.optionSelected.subscribe((val) => (emittedOption = val));

    const enterEvent = { key: 'Enter', preventDefault: jest.fn() } as unknown as KeyboardEvent;
    component.handleKeyDown(enterEvent);
    expect(emittedOption?.name).toBe('Syntra AI');

    let closed = false;
    component.closed.subscribe(() => (closed = true));
    const escEvent = { key: 'Escape', preventDefault: jest.fn() } as unknown as KeyboardEvent;
    component.handleKeyDown(escEvent);
    expect(closed).toBe(true);
  });

  it('should update selectedIndex on mouse hover', () => {
    component.options = [
      { id: 'syntra-ai', name: 'Syntra AI', type: 'ai' as any },
      { id: 'doc-1', name: 'File 1', type: MentionResourceType.DOCUMENT },
    ];

    component.onItemHover({ id: 'doc-1', name: 'File 1', type: MentionResourceType.DOCUMENT });
    expect(component.selectedIndex).toBe(1);
    expect(component.isSelected({ id: 'doc-1', name: 'File 1', type: MentionResourceType.DOCUMENT })).toBe(true);
    expect(component.isSelected({ id: 'syntra-ai', name: 'Syntra AI', type: 'ai' as any })).toBe(false);
  });

  it('should reset selectedIndex on ngOnChanges when options or isOpen change', () => {
    component.selectedIndex = 3;
    component.ngOnChanges({
      options: new SimpleChange([], [{ id: '1', name: 'New' }], false),
    });
    expect(component.selectedIndex).toBe(0);
  });
});
