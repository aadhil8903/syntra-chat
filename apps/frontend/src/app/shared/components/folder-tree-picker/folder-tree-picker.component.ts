import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  SimpleChanges,
  HostListener,
  ElementRef,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface IFolderTreeNode {
  name: string;
  fullPath: string;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  children: IFolderTreeNode[];
}

@Component({
  selector: 'app-folder-tree-picker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="relative dropdown-container w-full select-none" (click)="$event.stopPropagation()">
      <!-- Selected Badges Preview (Outside Trigger) -->
      @if (effectiveSelectedFolders.length > 0) {
        <div class="flex flex-wrap gap-1 mb-1.5">
          @for (folder of effectiveSelectedFolders; track folder) {
            <span
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border transition-colors"
              [ngClass]="getBadgeClass(folder)"
            >
              <span>📁 {{ folder }}</span>
              <span class="text-[9px] opacity-75 font-mono">{{ getInheritanceLabel(folder) }}</span>
              <button
                type="button"
                (click)="toggleFolderSelection(folder, $event)"
                class="hover:text-rose-400 font-bold ml-0.5"
                title="Toggle folder access"
              >
                ×
              </button>
            </span>
          }
        </div>
      }

      <!-- Main Dropdown Trigger Button -->
      <button
        type="button"
        (click)="toggleOpen($event)"
        class="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-[#18181b] border border-[#3f3f46] hover:border-white text-xs text-white transition-colors"
      >
        <span class="text-zinc-300 text-[11px] truncate">
          {{
            effectiveSelectedFolders.length > 0
              ? effectiveSelectedFolders.length + ' folder(s) accessible'
              : (placeholder || 'Select Allowed Folders...')
          }}
        </span>
        <svg
          class="w-3.5 h-3.5 text-zinc-400 transition-transform duration-200"
          [ngClass]="isOpen ? 'rotate-180 text-white' : ''"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <!-- Dropdown Tree Flyout Menu (VS Code Explorer Style) -->
      @if (isOpen) {
        <div
          class="absolute z-50 left-0 mt-1.5 w-84 bg-[#111114] border border-[#3f3f46] rounded-2xl shadow-2xl p-3 space-y-2.5 animate-fade-in text-xs"
        >
          <!-- Search and Quick Actions Bar -->
          <div class="flex items-center justify-between gap-2 pb-1.5 border-b border-[#27272a]">
            <div class="relative flex-1">
              <input
                type="text"
                [(ngModel)]="searchQuery"
                (input)="filterTree()"
                placeholder="Filter tree..."
                class="w-full pl-7 pr-2 py-1 bg-[#18181b] border border-[#27272a] rounded-lg text-[11px] text-white focus:outline-none focus:border-white placeholder:text-zinc-600 font-mono"
              />
              <svg class="w-3.5 h-3.5 text-zinc-500 absolute left-2 top-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <div class="flex items-center gap-1">
              <button
                type="button"
                (click)="expandAll()"
                class="px-1.5 py-1 text-[10px] text-zinc-400 hover:text-white rounded hover:bg-[#18181b]"
                title="Expand All"
              >
                Expand
              </button>
              <button
                type="button"
                (click)="collapseAll()"
                class="px-1.5 py-1 text-[10px] text-zinc-400 hover:text-white rounded hover:bg-[#18181b]"
                title="Collapse All"
              >
                Collapse
              </button>
            </div>
          </div>

          <!-- Tree Hierarchy View -->
          <div class="max-h-80 overflow-y-auto space-y-1 py-1 custom-scrollbar">
            @if (visibleNodes.length === 0) {
              <div class="py-4 text-center text-[#71717a] text-[11px]">
                No folders available. Create one below.
              </div>
            }

            @for (node of visibleNodes; track node.fullPath) {
              <div
                class="flex items-center gap-1.5 py-1 px-1 rounded-lg hover:bg-[#18181b] transition-colors group cursor-pointer"
                [style.padding-left.px]="node.depth * 16 + 4"
                (click)="toggleExpand(node, $event)"
              >
                <!-- Arrow / Chevron Toggle (VS Code Style) -->
                @if (node.hasChildren) {
                  <button
                    type="button"
                    (click)="toggleExpand(node, $event)"
                    class="w-4 h-4 flex items-center justify-center text-zinc-400 hover:text-white transition-transform p-0.5 rounded"
                    [title]="node.expanded ? 'Collapse folder' : 'Expand folder'"
                  >
                    <svg
                      class="w-3 h-3 transition-transform duration-150"
                      [ngClass]="node.expanded ? 'rotate-90 text-white' : ''"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
                    </svg>
                  </button>
                } @else {
                  <span class="w-4 h-4 inline-block"></span>
                }

                <!-- Checkbox for Selection -->
                <input
                  type="checkbox"
                  [checked]="isFolderEffectivelyAllowed(node.fullPath)"
                  (click)="onCheckboxClick(node, $event)"
                  class="rounded border-zinc-700 bg-zinc-900 text-white focus:ring-0 cursor-pointer w-3.5 h-3.5"
                />

                <!-- Folder Icon & Name -->
                <span class="text-sm">📁</span>
                <span
                  class="font-mono text-xs truncate max-w-[130px]"
                  [ngClass]="isFolderEffectivelyAllowed(node.fullPath) ? 'text-white font-medium' : 'text-zinc-400'"
                >
                  {{ node.name }}
                </span>

                <!-- Inheritance Badge Indicator -->
                @if (isFolderEffectivelyAllowed(node.fullPath)) {
                  <span
                    class="ml-auto text-[9px] px-1.5 py-0.2 rounded border font-mono whitespace-nowrap"
                    [ngClass]="getBadgeClass(node.fullPath)"
                  >
                    {{ getInheritanceLabel(node.fullPath) }}
                  </span>
                }
              </div>
            }
          </div>

          <!-- Add New Folder Custom Input -->
          <div class="pt-2 border-t border-[#27272a] flex items-center gap-1.5">
            <input
              type="text"
              [(ngModel)]="newFolderInput"
              (keydown.enter)="addNewFolder($event)"
              placeholder="+ Add folder (e.g. Sales, Q1/Reports)..."
              class="flex-1 px-2.5 py-1 rounded-lg bg-[#18181b] border border-[#27272a] text-[11px] text-white focus:outline-none focus:border-white placeholder:text-zinc-600 font-mono"
            />
            <button
              type="button"
              (click)="addNewFolder($event)"
              [disabled]="!newFolderInput.trim()"
              class="px-2.5 py-1 bg-white hover:bg-zinc-200 text-black text-[10px] font-semibold rounded-lg disabled:opacity-40 transition-colors"
            >
              Add
            </button>
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .custom-scrollbar::-webkit-scrollbar {
        width: 4px;
      }
      .custom-scrollbar::-webkit-scrollbar-track {
        background: transparent;
      }
      .custom-scrollbar::-webkit-scrollbar-thumb {
        background: #27272a;
        border-radius: 4px;
      }
    `,
  ],
})
export class FolderTreePickerComponent implements OnInit, OnChanges {
  private elementRef = inject(ElementRef);

  @Input() availableFolders: string[] = [];
  @Input() selectedFolders: string[] = [];
  @Input() deniedFolders: string[] = [];
  @Input() roleFolders: string[] = [];
  @Input() deptFolders: string[] = [];
  @Input() placeholder: string = 'Select Allowed Folders...';

  @Output() selectedFoldersChange = new EventEmitter<string[]>();
  @Output() deniedFoldersChange = new EventEmitter<string[]>();
  @Output() availableFoldersChange = new EventEmitter<string[]>();

  isOpen = false;
  searchQuery = '';
  newFolderInput = '';

  rootNodes: IFolderTreeNode[] = [];
  visibleNodes: IFolderTreeNode[] = [];

  ngOnInit(): void {
    this.rebuildTree();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      changes['availableFolders'] ||
      changes['selectedFolders'] ||
      changes['deniedFolders'] ||
      changes['roleFolders'] ||
      changes['deptFolders']
    ) {
      this.rebuildTree();
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.isOpen = false;
    }
  }

  toggleOpen(event: MouseEvent): void {
    event.stopPropagation();
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      this.rebuildTree();
    }
  }

  get effectiveSelectedFolders(): string[] {
    const set = new Set<string>();
    const all = Array.from(
      new Set([
        ...this.availableFolders,
        ...this.selectedFolders,
        ...this.roleFolders,
        ...this.deptFolders,
      ])
    ).filter((p) => p && p.trim());

    for (const f of all) {
      if (this.isFolderEffectivelyAllowed(f)) {
        set.add(f);
      }
    }
    return Array.from(set).sort();
  }

  isFolderEffectivelyAllowed(folderPath: string): boolean {
    if (!folderPath) return false;
    const clean = folderPath.trim();

    // 1. Explicit user rules (ancestor walk)
    const ancestors = this.getAncestors(clean);
    for (const anc of ancestors) {
      if (this.deniedFolders.includes(anc)) {
        return false; // Explicit user Deny
      }
      if (this.selectedFolders.includes(anc)) {
        return true; // Explicit user Allow
      }
    }

    // 2. Role template grants
    if (ancestors.some((anc) => this.roleFolders.includes(anc))) {
      return true;
    }

    // 3. Department grants
    if (ancestors.some((anc) => this.deptFolders.includes(anc))) {
      return true;
    }

    return false;
  }

  getInheritanceLabel(folderPath: string): string {
    const ancestors = this.getAncestors(folderPath);
    if (ancestors.some((anc) => this.selectedFolders.includes(anc))) {
      return 'custom';
    }
    if (ancestors.some((anc) => this.roleFolders.includes(anc))) {
      return 'role';
    }
    if (ancestors.some((anc) => this.deptFolders.includes(anc))) {
      return 'dept';
    }
    return '';
  }

  getBadgeClass(folderPath: string): string {
    const label = this.getInheritanceLabel(folderPath);
    if (label === 'role') {
      return 'bg-blue-950/40 text-blue-300 border-blue-800/60';
    }
    if (label === 'dept') {
      return 'bg-emerald-950/40 text-emerald-300 border-emerald-800/60';
    }
    return 'bg-[#18181b] text-zinc-200 border-[#3f3f46]';
  }

  private getAncestors(folderPath: string): string[] {
    const clean = (folderPath || '').trim();
    if (!clean) return [''];
    const parts = clean.split('/').filter((p) => p.length > 0);
    const chain: string[] = [];
    for (let i = parts.length; i > 0; i--) {
      chain.push(parts.slice(0, i).join('/'));
    }
    chain.push('');
    return chain;
  }

  onCheckboxClick(node: IFolderTreeNode, event: MouseEvent): void {
    event.stopPropagation();
    this.toggleFolderSelection(node.fullPath);
  }

  toggleFolderSelection(folderPath: string, event?: MouseEvent): void {
    if (event) event.stopPropagation();
    const clean = folderPath.trim();
    const isCurrentlyAllowed = this.isFolderEffectivelyAllowed(clean);

    const ancestors = this.getAncestors(clean);
    const inheritedFromRoleOrDept =
      ancestors.some((anc) => this.roleFolders.includes(anc)) ||
      ancestors.some((anc) => this.deptFolders.includes(anc));

    let newSelected = [...this.selectedFolders];
    let newDenied = [...this.deniedFolders];

    if (isCurrentlyAllowed) {
      // User is toggling OFF
      if (newSelected.includes(clean)) {
        newSelected = newSelected.filter((f) => f !== clean);
      }
      if (inheritedFromRoleOrDept && !newDenied.includes(clean)) {
        newDenied.push(clean);
      }
    } else {
      // User is toggling ON
      if (newDenied.includes(clean)) {
        newDenied = newDenied.filter((f) => f !== clean);
      }
      if (!inheritedFromRoleOrDept && !newSelected.includes(clean)) {
        newSelected.push(clean);
      }
    }

    this.selectedFolders = newSelected;
    this.deniedFolders = newDenied;
    this.selectedFoldersChange.emit(this.selectedFolders);
    this.deniedFoldersChange.emit(this.deniedFolders);
    this.rebuildTree();
  }

  rebuildTree(): void {
    const rawPaths = Array.from(
      new Set([
        ...this.availableFolders,
        ...this.selectedFolders,
        ...this.roleFolders,
        ...this.deptFolders,
      ])
    )
      .filter((p) => p && p.trim())
      .sort();

    const rootMap = new Map<string, IFolderTreeNode>();

    for (const path of rawPaths) {
      const parts = path.split('/');
      let currentPath = '';
      let parentNode: IFolderTreeNode | null = null;

      for (let i = 0; i < parts.length; i++) {
        const seg = parts[i];
        currentPath = currentPath ? `${currentPath}/${seg}` : seg;

        if (i === 0) {
          if (!rootMap.has(seg)) {
            rootMap.set(seg, {
              name: seg,
              fullPath: seg,
              depth: 0,
              hasChildren: false,
              expanded: true,
              children: [],
            });
          }
          parentNode = rootMap.get(seg)!;
        } else if (parentNode) {
          parentNode.hasChildren = true;
          let childNode: IFolderTreeNode | undefined = parentNode.children.find((c) => c.name === seg);
          if (!childNode) {
            childNode = {
              name: seg,
              fullPath: currentPath,
              depth: i,
              hasChildren: false,
              expanded: true,
              children: [],
            };
            parentNode.children.push(childNode);
          }
          parentNode = childNode;
        }
      }
    }

    this.rootNodes = Array.from(rootMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    this.filterTree();
  }

  filterTree(): void {
    const query = this.searchQuery.toLowerCase().trim();
    if (!query) {
      this.visibleNodes = this.flattenNodes(this.rootNodes);
      return;
    }

    const matches = (node: IFolderTreeNode): boolean => {
      if (node.name.toLowerCase().includes(query) || node.fullPath.toLowerCase().includes(query)) {
        return true;
      }
      return node.children.some((c) => matches(c));
    };

    const cloneFiltered = (nodes: IFolderTreeNode[]): IFolderTreeNode[] => {
      const result: IFolderTreeNode[] = [];
      for (const node of nodes) {
        if (matches(node)) {
          const clone: IFolderTreeNode = {
            ...node,
            expanded: true,
            children: cloneFiltered(node.children),
          };
          clone.hasChildren = clone.children.length > 0;
          result.push(clone);
        }
      }
      return result;
    };

    const filteredRoots = cloneFiltered(this.rootNodes);
    this.visibleNodes = this.flattenNodes(filteredRoots);
  }

  private flattenNodes(nodes: IFolderTreeNode[]): IFolderTreeNode[] {
    const list: IFolderTreeNode[] = [];
    for (const node of nodes) {
      list.push(node);
      if (node.expanded && node.children.length > 0) {
        list.push(...this.flattenNodes(node.children));
      }
    }
    return list;
  }

  toggleExpand(node: IFolderTreeNode, event: MouseEvent): void {
    event.stopPropagation();
    if (node.hasChildren) {
      node.expanded = !node.expanded;
      this.filterTree();
    }
  }

  expandAll(): void {
    const recurse = (nodes: IFolderTreeNode[]) => {
      for (const n of nodes) {
        n.expanded = true;
        recurse(n.children);
      }
    };
    recurse(this.rootNodes);
    this.filterTree();
  }

  collapseAll(): void {
    const recurse = (nodes: IFolderTreeNode[]) => {
      for (const n of nodes) {
        n.expanded = false;
        recurse(n.children);
      }
    };
    recurse(this.rootNodes);
    this.filterTree();
  }

  addNewFolder(event: Event): void {
    event.stopPropagation();
    const val = this.newFolderInput.trim().replace(/^\/+|\/+$/g, '');
    if (!val) return;

    if (!this.availableFolders.includes(val)) {
      this.availableFolders.push(val);
      this.availableFolders.sort();
      this.availableFoldersChange.emit(this.availableFolders);
    }

    if (!this.selectedFolders.includes(val)) {
      this.selectedFolders.push(val);
      this.selectedFoldersChange.emit(this.selectedFolders);
    }

    this.newFolderInput = '';
    this.rebuildTree();
  }
}
