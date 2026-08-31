import { MentionAutocompleteComponent } from './mention-autocomplete.component';
import { IMentionOption, MentionResourceType } from '@enter-chat/shared-types';
import { SimpleChange } from '@angular/core';

describe('MentionAutocompleteComponent', () => {
  let component: MentionAutocompleteComponent;

  beforeEach(() => {
    component = new MentionAutocompleteComponent();
  });

  it('should initialize with closed state and empty options', () => {
    expect(component.isOpen).toBe(false);
    expect(component.options).toEqual([]);
    expect(component.selectedIndex).toBe(0);
    expect(component.activeTab).toBe('all');
  });

  it('should filter options by active tab: all, folders, docs, data', () => {
    const options: IMentionOption[] = [
      { id: '1', name: 'Finance Folder', type: MentionResourceType.FOLDER },
      { id: '2', name: 'policies.pdf', type: MentionResourceType.DOCUMENT, fileType: 'pdf' },
      { id: '3', name: 'sales.csv', type: MentionResourceType.DATASET, fileType: 'csv' },
    ];
    component.options = options;

    component.activeTab = 'all';
    expect(component.filteredOptions.length).toBe(3);

    component.activeTab = 'folders';
    expect(component.filteredOptions.length).toBe(1);
    expect(component.filteredOptions[0].name).toBe('Finance Folder');

    component.activeTab = 'docs';
    expect(component.filteredOptions.length).toBe(1);
    expect(component.filteredOptions[0].name).toBe('policies.pdf');

    component.activeTab = 'data';
    expect(component.filteredOptions.length).toBe(1);
    expect(component.filteredOptions[0].name).toBe('sales.csv');
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

  it('should handle keyboard navigation: ArrowDown, ArrowUp, Enter, and Escape', () => {
    component.isOpen = true;
    component.options = [
      { id: '1', name: 'File 1', type: MentionResourceType.DOCUMENT },
      { id: '2', name: 'File 2', type: MentionResourceType.DOCUMENT },
    ];

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
    expect(emittedOption?.name).toBe('File 1');

    let closed = false;
    component.closed.subscribe(() => (closed = true));
    const escEvent = { key: 'Escape', preventDefault: jest.fn() } as unknown as KeyboardEvent;
    component.handleKeyDown(escEvent);
    expect(closed).toBe(true);
  });

  it('should reset selectedIndex on ngOnChanges when options or isOpen change', () => {
    component.selectedIndex = 3;
    component.ngOnChanges({
      options: new SimpleChange([], [{ id: '1', name: 'New' }], false),
    });
    expect(component.selectedIndex).toBe(0);
  });
});
