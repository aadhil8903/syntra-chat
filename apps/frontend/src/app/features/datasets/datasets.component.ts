import { Component, OnInit, OnDestroy, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { IDataset, DatasetStatus, IDatasetSheet } from '@enter-chat/shared-types';
import { AuthService } from '../../core/services/auth.service';
import { ModalDialogService } from '../../core/services/modal-dialog.service';
import { extractDroppedFilesAndFolders } from '../../core/utils/drag-drop-folder.util';

@Component({
  selector: 'app-datasets',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="relative p-8 max-w-7xl mx-auto space-y-6 animate-fade-in">
      <!-- OS Drag & Drop Full Area Dashed Overlay Cue (Admin Only) -->
      @if (isOsDragOver && isAdmin) {
        <div class="fixed inset-0 z-50 bg-[#09090b]/85 backdrop-blur-md flex flex-col items-center justify-center p-8 pointer-events-none animate-fade-in">
          <div class="w-full max-w-2xl border-2 border-dashed border-white rounded-3xl p-12 text-center space-y-4 bg-[#111114]/95">
            <div class="w-16 h-16 rounded-2xl bg-white text-black flex items-center justify-center mx-auto">
              <svg class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <h2 class="text-xl font-bold text-white tracking-tight">Drop datasets or folders to upload</h2>
            <p class="text-sm text-[#a1a1aa] max-w-md mx-auto">
              {{ activeFolder ? 'Uploading into folder "' + activeFolder + '"' : 'Uploading to Root' }}
            </p>
          </div>
        </div>
      }

      <!-- Instant Toast Notification -->
      @if (toastMessage) {
        <div class="fixed bottom-8 right-8 z-50 px-4 py-3 rounded-2xl bg-[#111114] border border-zinc-700 text-white flex items-center gap-3 animate-fade-in">
          <div class="w-2 h-2 rounded-full bg-white animate-pulse"></div>
          <span class="text-xs font-medium">{{ toastMessage }}</span>
        </div>
      }

      <!-- Header -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold text-white tracking-tight">Analytical Datasets & Excel</h1>
          <p class="text-sm text-[#a1a1aa] mt-1">
            Organize datasets into folders or upload directly to root. Drag & drop CSV/Excel files and folders directly from your desktop.
          </p>
        </div>
        <div class="flex items-center gap-3">
          <!-- Admin Only Actions: Delete Folder, New Folder, Upload -->
          @if (isAdmin) {
            @if (activeFolder) {
              <button
                (click)="deleteFolder(activeFolder)"
                class="px-3 py-2 rounded-xl bg-[#18181b] hover:bg-[#27272a] text-zinc-300 hover:text-white border border-zinc-800 text-xs font-medium transition-colors flex items-center gap-1.5"
                title="Delete this folder"
              >
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <span>Delete Folder</span>
              </button>
            }

            <button
              (click)="showNewFolderInput = !showNewFolderInput"
              class="px-3.5 py-2 rounded-xl bg-[#141417] hover:bg-[#1f1f23] text-white border border-[#27272a] text-sm font-medium transition-colors flex items-center gap-2"
            >
              <svg class="w-4 h-4 text-zinc-300" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h5l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              </svg>
              <span>+ New Folder</span>
            </button>
    
            <label class="px-4 py-2 rounded-xl bg-white hover:bg-zinc-200 text-black font-semibold text-xs transition-colors cursor-pointer inline-flex items-center gap-2">
              <svg class="w-4 h-4" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              <span>{{ uploading ? 'Uploading...' : (activeFolder ? 'Upload to ' + activeFolder : 'Upload Dataset') }}</span>
              <input type="file" (change)="onFileSelected($event)" accept=".csv,.xlsx,.xls" class="hidden" [disabled]="uploading" />
            </label>
          }
        </div>
      </div>

      <!-- Quick New Folder / Subfolder Input Bar (Admin Only) with Department Selection -->
      @if (showNewFolderInput && isAdmin) {
        <div class="p-5 rounded-2xl bg-[#111114] border border-[#27272a] space-y-4 animate-fade-in">
          <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div class="flex items-center gap-2 flex-1">
              <svg class="w-5 h-5 text-zinc-300 flex-shrink-0" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              @if (activeFolder) {
                <span class="text-xs text-[#a1a1aa] font-mono bg-[#0c0c0e] px-2 py-1.5 rounded-lg border border-[#27272a]">
                  {{ activeFolder }}/
                </span>
              }
              <input
                type="text"
                [(ngModel)]="newFolderName"
                (keydown.enter)="createFolder()"
                [placeholder]="activeFolder ? 'Enter subfolder name (e.g. Q4)...' : 'Enter folder name (e.g. Sales, Financials)...'"
                class="flex-1 px-3 py-2 rounded-xl bg-[#09090b] border border-[#27272a] text-white text-sm focus:outline-none focus:border-white transition-colors placeholder:text-zinc-500"
              />
            </div>
            <div class="flex items-center gap-2">
              <button
                (click)="createFolder()"
                [disabled]="!newFolderName.trim()"
                class="px-4 py-2 rounded-xl bg-white hover:bg-zinc-200 text-black text-xs font-semibold disabled:opacity-50 transition-colors"
              >
                Create Folder
              </button>
              <button
                (click)="showNewFolderInput = false; newFolderName = ''; newFolderDepartments = []"
                class="px-3 py-2 rounded-xl bg-[#18181b] hover:bg-[#27272a] text-[#a1a1aa] hover:text-white text-xs font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>

          <!-- Department Multi-Select Chips -->
          <div class="pt-3 border-t border-[#27272a] space-y-2">
            <div class="flex items-center justify-between">
              <label class="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                <span>Assign Department Access</span>
                <span class="text-[10px] text-[#71717a] font-normal">• Members of selected departments get access</span>
              </label>
              @if (newFolderDepartments.length > 0) {
                <span class="text-[11px] text-zinc-300 font-mono">{{ newFolderDepartments.length }} selected</span>
              } @else {
                <span class="text-[11px] text-[#71717a]">Unrestricted</span>
              }
            </div>
            <div class="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
              @for (dept of standardDepartments; track dept) {
                <button
                  type="button"
                  (click)="toggleNewFolderDept(dept)"
                  [ngClass]="newFolderDepartments.includes(dept) ? 'bg-white text-black font-semibold border-white' : 'bg-[#18181b] text-zinc-400 border-[#27272a] hover:text-white hover:border-zinc-500'"
                  class="px-2.5 py-1 rounded-lg text-xs border transition-all flex items-center gap-1"
                >
                  <span>{{ dept }}</span>
                  @if (newFolderDepartments.includes(dept)) {
                    <svg class="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
                    </svg>
                  }
                </button>
              }
            </div>
          </div>
        </div>
      }

      @if (uploadError) {
        <div class="p-3 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-300 text-xs flex items-center justify-between">
          <span>{{ uploadError }}</span>
          <button (click)="uploadError = ''" class="hover:underline font-bold">Dismiss</button>
        </div>
      }

      <!-- Breadcrumbs & Directory Path Navigation -->
      <div class="flex items-center justify-between gap-4 bg-[#0c0c0e] p-3 rounded-2xl border border-[#27272a]">
        <div class="flex items-center gap-1.5 text-xs text-[#a1a1aa] overflow-x-auto">
          <button
            (click)="setActiveFolder(null)"
            (dragover)="onFolderDragOver($event, '')"
            (dragleave)="onFolderDragLeave($event, '')"
            (drop)="onFolderDrop($event, '')"
            [ngClass]="activeFolder === null ? 'text-black font-semibold bg-white' : (dragOverTargetFolder === '' ? 'border-zinc-500 bg-zinc-800 text-white' : 'text-[#a1a1aa] hover:text-white')"
            class="px-2.5 py-1 rounded-lg transition-all font-medium flex items-center gap-1.5 border border-transparent"
          >
            <svg class="w-3.5 h-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span>All Datasets</span>
          </button>

          <span class="text-[#3f3f46]">/</span>

          <button
            (click)="setActiveFolder('')"
            (dragover)="onFolderDragOver($event, '')"
            (dragleave)="onFolderDragLeave($event, '')"
            (drop)="onFolderDrop($event, '')"
            [ngClass]="activeFolder === '' ? 'text-black font-semibold bg-white' : (dragOverTargetFolder === '' ? 'border-zinc-500 bg-zinc-800 text-white' : 'text-[#a1a1aa] hover:text-white')"
            class="px-2 py-1 rounded-lg transition-all border border-transparent"
          >
            Root
          </button>

          @for (b of activeFolderBreadcrumbs; track b.path; let last = $last) {
            <span class="text-[#3f3f46]">/</span>
            @if (!last) {
              <button
                (click)="setActiveFolder(b.path)"
                (dragover)="onFolderDragOver($event, b.path)"
                (dragleave)="onFolderDragLeave($event, b.path)"
                (drop)="onFolderDrop($event, b.path)"
                [ngClass]="dragOverTargetFolder === b.path ? 'border-zinc-500 bg-zinc-800 text-white' : 'text-[#a1a1aa] hover:text-white hover:bg-[#18181b]'"
                class="px-2 py-1 rounded-lg transition-all font-medium border border-transparent"
              >
                {{ b.name }}
              </button>
            } @else {
              <span
                (dragover)="onFolderDragOver($event, b.path)"
                (dragleave)="onFolderDragLeave($event, b.path)"
                (drop)="onFolderDrop($event, b.path)"
                class="px-2 py-1 rounded-lg text-black font-semibold bg-white"
              >
                {{ b.name }}
              </span>
            }
          }
        </div>

        @if (activeFolder && isAdmin) {
          <div class="flex items-center gap-2">
            <button
              (click)="showNewFolderInput = true"
              class="px-2.5 py-1 rounded-lg bg-[#141417] hover:bg-[#1f1f23] text-white border border-[#27272a] text-xs font-medium transition-colors flex items-center gap-1.5"
            >
              <svg class="w-3.5 h-3.5 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
              <span>+ Subfolder</span>
            </button>
          </div>
        }
      </div>

      <!-- Direct Subfolders Row (Droppable targets) -->
      @if (currentSubfolders.length > 0) {
        <div class="space-y-2">
          <div class="text-[11px] font-semibold uppercase tracking-wider text-[#a1a1aa] flex items-center gap-1.5">
            <svg class="w-3.5 h-3.5 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <span>{{ activeFolder ? 'Subfolders in "' + activeFolder + '"' : 'Folders' }} ({{ currentSubfolders.length }})</span>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
            @for (sub of currentSubfolders; track sub.fullPath) {
              <div
                (click)="setActiveFolder(sub.fullPath)"
                (dragover)="onFolderDragOver($event, sub.fullPath)"
                (dragleave)="onFolderDragLeave($event, sub.fullPath)"
                (drop)="onFolderDrop($event, sub.fullPath)"
                [ngClass]="dragOverTargetFolder === sub.fullPath ? 'border-zinc-500 bg-zinc-800 text-white' : 'border-[#27272a] bg-[#111114] hover:border-white'"
                class="group p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between"
              >
                <div class="flex items-center gap-2 truncate">
                  <svg class="w-4 h-4 text-zinc-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  <div class="truncate">
                    <div class="text-xs font-semibold text-white truncate">{{ sub.name }}</div>
                    <div class="text-[10px] text-[#71717a]">{{ sub.count }} dataset(s)</div>
                  </div>
                </div>

                <button
                  *ngIf="isAdmin"
                  (click)="$event.stopPropagation(); deleteFolder(sub.fullPath)"
                  class="opacity-0 group-hover:opacity-100 hover:text-white transition-opacity p-1 rounded-lg hover:bg-zinc-800 text-zinc-500"
                  title="Delete folder"
                >
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            }
          </div>
        </div>
      }

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Datasets List -->
        <div class="lg:col-span-1 space-y-3">
          <h2 class="text-xs font-semibold uppercase tracking-wider text-[#a1a1aa]">
            {{ activeFolder ? activeFolder : 'Datasets' }} ({{ filteredDatasets.length }})
          </h2>

          @if (loading) {
            <div class="p-8 text-center text-[#71717a] text-sm">Loading datasets...</div>
          } @else if (filteredDatasets.length === 0) {
            <div class="p-8 bg-[#111114] border border-[#27272a] rounded-2xl text-center text-[#71717a] text-sm">
              No datasets in this view.
            </div>
          } @else {
            <div class="space-y-2">
              @for (ds of filteredDatasets; track ds.id) {
                <div
                  (click)="selectDataset(ds)"
                  [draggable]="isAdmin"
                  (dragstart)="onDatasetDragStart($event, ds)"
                  (dragend)="onDatasetDragEnd()"
                  [ngClass]="[
                    selectedDataset?.id === ds.id ? 'border-white bg-[#18181b]' : 'border-[#27272a] bg-[#111114] hover:border-[#3f3f46]',
                    isAdmin ? 'cursor-grab active:cursor-grabbing select-none' : 'cursor-pointer'
                  ]"
                  class="p-4 rounded-2xl border transition-all flex flex-col gap-2"
                >
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0 flex items-start gap-2">
                      <svg *ngIf="isAdmin" class="w-4 h-4 text-zinc-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8h16M4 16h16" />
                      </svg>
                      <div class="min-w-0">
                        <div class="font-medium text-white text-sm truncate">{{ ds.originalName }}</div>
                        <div class="flex items-center gap-2 mt-1">
                          <span class="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-[#141417] text-white border border-[#27272a]">
                            {{ ds.fileType }}
                          </span>
                          <span class="text-xs text-[#71717a] font-mono">{{ ds.totalRows }} rows</span>
                        </div>
                      </div>
                    </div>
                    <ng-container *ngIf="ds.hasAccess; else noAccess">
                      <button
                        *ngIf="isAdmin"
                        (click)="deleteDataset(ds.id, $event)"
                        class="text-zinc-500 hover:text-white p-1.5 rounded-lg hover:bg-zinc-800 transition-colors flex-shrink-0"
                        title="Delete dataset"
                      >
                        <svg class="w-4 h-4" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </ng-container>
                    <ng-template #noAccess>
                      <button (click)="requestAccess(ds.id, $event)" class="px-2 py-1 bg-[#18181b] text-white rounded-md text-[10px] hover:bg-[#27272a] border border-[#3f3f46] transition-colors flex-shrink-0">
                        Request Access
                      </button>
                    </ng-template>
                  </div>

                  <!-- Folder Tag Display -->
                  <div class="flex items-center justify-between pt-1 border-t border-[#27272a]">
                    <span class="text-[11px] text-[#71717a]">Folder:</span>
                    <span class="text-[11px] text-zinc-300 font-mono bg-[#0c0c0e] px-2 py-0.5 rounded border border-[#27272a]">
                      {{ ds.folder ? '📁 ' + ds.folder : 'Root / None' }}
                    </span>
                  </div>
                </div>
              }
            </div>
          }
        </div>

        <!-- Dataset Schema & Preview View -->
        <div class="lg:col-span-2">
          @if (selectedDataset) {
            <div class="bg-[#111114] border border-[#27272a] rounded-2xl p-6 space-y-6">
              <div class="flex items-center justify-between">
                <div>
                  <h3 class="text-lg font-bold text-white">{{ selectedDataset.originalName }}</h3>
                  <div class="flex items-center gap-2 mt-1 text-xs text-[#a1a1aa]">
                    <span>{{ selectedDataset.totalRows }} Total Rows</span>
                    <span>•</span>
                    <span>{{ selectedDataset.sheetNames.length }} Sheet(s)</span>
                    @if (selectedDataset.folder) {
                      <span>•</span>
                      <span class="text-zinc-300">📁 {{ selectedDataset.folder }}</span>
                    }
                  </div>
                </div>

                @if (selectedDataset.status === DatasetStatus.FAILED && isAdmin) {
                  <button
                    (click)="retryDs(selectedDataset.id)"
                    class="px-3 py-1.5 rounded-xl bg-[#18181b] hover:bg-[#27272a] text-white text-xs font-medium border border-[#3f3f46] transition-colors"
                  >
                    Retry Inspect
                  </button>
                }
              </div>

              <!-- Sheet Tabs if multiple -->
              @if (selectedDataset.sheets.length > 1) {
                <div class="flex gap-2 border-b border-[#27272a] pb-2 overflow-x-auto">
                  @for (sheet of selectedDataset.sheets; track sheet.sheetName; let idx = $index) {
                    <button
                      (click)="activeSheetIndex = idx"
                      [ngClass]="activeSheetIndex === idx ? 'bg-white text-black font-semibold' : 'bg-[#18181b] text-[#a1a1aa] hover:text-white border border-[#27272a]'"
                      class="px-3 py-1 rounded-xl text-xs transition-colors whitespace-nowrap"
                    >
                      {{ sheet.sheetName }} ({{ sheet.rowCount }})
                    </button>
                  }
                </div>
              }

              <!-- Active Sheet Schema Columns -->
              @if (activeSheet) {
                <div class="space-y-3">
                  <h4 class="text-xs font-semibold uppercase tracking-wider text-[#a1a1aa]">
                    Columns & Data Types ({{ activeSheet.columns.length }})
                  </h4>
                  <div class="flex flex-wrap gap-2">
                    @for (col of activeSheet.columns; track col.name) {
                      <span class="px-2.5 py-1 rounded-xl bg-[#18181b] border border-[#27272a] text-xs font-mono text-white flex items-center gap-1.5">
                        <span>{{ col.name }}</span>
                        <span class="text-[10px] text-zinc-400">({{ col.dtype }})</span>
                      </span>
                    }
                  </div>
                </div>

                <!-- Preview Table -->
                @if (activeSheet.previewRows && activeSheet.previewRows.length > 0) {
                  <div class="space-y-3">
                    <h4 class="text-xs font-semibold uppercase tracking-wider text-[#a1a1aa]">
                      Data Sample (First {{ activeSheet.previewRows.length }} Rows)
                    </h4>
                    <div class="rounded-xl border border-[#27272a] overflow-x-auto max-h-80 overflow-y-auto">
                      <table class="w-full text-left text-xs font-mono">
                        <thead class="bg-[#0c0c0e] text-[#a1a1aa] uppercase sticky top-0 border-b border-[#27272a]">
                          <tr>
                            @for (col of activeSheet.columns; track col.name) {
                              <th class="px-4 py-2.5 whitespace-nowrap">{{ col.name }}</th>
                            }
                          </tr>
                        </thead>
                        <tbody class="divide-y divide-[#27272a]">
                          @for (row of activeSheet.previewRows; track $index) {
                            <tr class="hover:bg-[#18181b]/50">
                              @for (col of activeSheet.columns; track col.name) {
                                <td class="px-4 py-2 text-zinc-300 whitespace-nowrap">{{ row[col.name] }}</td>
                              }
                            </tr>
                          }
                        </tbody>
                      </table>
                    </div>
                  </div>
                }
              }
            </div>
          } @else {
            <div class="h-64 border-2 border-dashed border-[#27272a] rounded-2xl flex flex-col items-center justify-center p-6 text-center text-[#71717a] space-y-2">
              <svg class="w-8 h-8 text-zinc-400" width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span class="text-sm font-medium">Select a dataset from the list to preview schema and sample records</span>
            </div>
          }
        </div>
      </div>
    </div>
  `,
})
export class DatasetsComponent implements OnInit, OnDestroy {
  newFolderDepartments: string[] = [];
  standardDepartments: string[] = [
    'Engineering',
    'Product',
    'Design',
    'Sales',
    'Marketing',
    'Finance',
    'HR',
    'Legal',
    'Operations',
    'Executive',
  ];
  toggleNewFolderDept(dept: string): void {
    const idx = this.newFolderDepartments.indexOf(dept);
    if (idx > -1) {
      this.newFolderDepartments.splice(idx, 1);
    } else {
      this.newFolderDepartments.push(dept);
    }
  }

  private api = inject(ApiService);
  private auth = inject(AuthService);
  private modal = inject(ModalDialogService);
  private readonly STORAGE_KEY = 'syntra_chat_dataset_folders';

  get isAdmin(): boolean {
    return this.auth.isAdmin();
  }

  datasets: IDataset[] = [];
  selectedDataset: IDataset | null = null;
  activeSheetIndex = 0;
  loading = true;
  uploading = false;
  uploadError = '';
  toastMessage = '';
  DatasetStatus = DatasetStatus;

  // Drag and Drop States
  isOsDragOver = false;
  dragOverTargetFolder: string | null = null;
  draggedDataset: IDataset | null = null;
  draggedDatasetId: string | null = null;

  // Folder states
  activeFolder: string | null = null;
  availableFolders: string[] = [];
  showNewFolderInput = false;
  newFolderName = '';

  private pollInterval: any;

  private loadSavedFolders(): string[] {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private saveFolders(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.availableFolders));
    } catch {}
  }

  private showToast(msg: string): void {
    this.toastMessage = msg;
    setTimeout(() => {
      if (this.toastMessage === msg) this.toastMessage = '';
    }, 3500);
  }

  get activeSheet(): IDatasetSheet | null {
    if (!this.selectedDataset || !this.selectedDataset.sheets) return null;
    return this.selectedDataset.sheets[this.activeSheetIndex] || null;
  }

  ngOnInit(): void {
    this.availableFolders = this.loadSavedFolders();
    this.loadDatasets();
    this.pollInterval = setInterval(() => {
      const hasProcessing = this.datasets.some((d) => d.status === DatasetStatus.PROCESSING);
      if (hasProcessing) {
        this.api.getDatasets().subscribe((dsList) => {
          this.datasets = dsList;
          this.rebuildFolders();
          if (this.selectedDataset) {
            const updated = dsList.find((d) => d.id === this.selectedDataset!.id);
            if (updated) this.selectedDataset = updated;
          }
        });
      }
    }, 4000);
  }

  ngOnDestroy(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
  }

  // ---------------- Global Window OS Drag & Drop Handlers ----------------
  @HostListener('window:dragover', ['$event'])
  onWindowDragOver(event: DragEvent): void {
    if (!this.isAdmin) return;
    if (this.draggedDataset || this.draggedDatasetId) return; // In-app item drag

    const types = Array.from(event.dataTransfer?.types || []);
    if (types.includes('Files')) {
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
      }
      this.isOsDragOver = true;
    }
  }

  @HostListener('window:dragleave', ['$event'])
  onWindowDragLeave(event: DragEvent): void {
    if (event.clientX <= 0 || event.clientY <= 0 || event.clientX >= window.innerWidth || event.clientY >= window.innerHeight) {
      this.isOsDragOver = false;
    }
  }

  @HostListener('window:drop', ['$event'])
  async onWindowDrop(event: DragEvent): Promise<void> {
    if (this.draggedDataset || this.draggedDatasetId) return; // In-app item drag

    const types = Array.from(event.dataTransfer?.types || []);
    if (types.includes('Files')) {
      event.preventDefault();
      event.stopPropagation();
      this.isOsDragOver = false;

      if (!this.isAdmin) {
        this.uploadError = 'Upload permission denied. Only administrators can upload datasets.';
        return;
      }

      await this.handleOsFilesDrop(event.dataTransfer!, this.activeFolder || '');
    }
  }

  private async handleOsFilesDrop(dataTransfer: DataTransfer, targetBaseFolder: string): Promise<void> {
    try {
      this.uploading = true;
      this.uploadError = '';

      const droppedItems = await extractDroppedFilesAndFolders(dataTransfer);
      if (droppedItems.length === 0) {
        this.uploading = false;
        return;
      }

      let count = 0;
      for (const item of droppedItems) {
        let finalFolder = targetBaseFolder;
        if (item.relativePath && item.relativePath.includes('/')) {
          const relDir = item.relativePath.substring(0, item.relativePath.lastIndexOf('/'));
          finalFolder = finalFolder ? `${finalFolder}/${relDir}` : relDir;
        }

        if (finalFolder && !this.availableFolders.includes(finalFolder)) {
          this.availableFolders.push(finalFolder);
          this.saveFolders();
        }

        await new Promise<void>((resolve) => {
          this.api.uploadDataset(item.file, finalFolder).subscribe({
            next: (ds) => {
              this.datasets.unshift(ds);
              this.rebuildFolders();
              if (!this.selectedDataset) {
                this.selectedDataset = ds;
              }
              count++;
              resolve();
            },
            error: (err) => {
              this.uploadError = err.error?.message || 'Upload failed.';
              resolve();
            },
          });
        });
      }
      this.uploading = false;
      if (count > 0) {
        this.showToast(`Successfully uploaded ${count} dataset(s)`);
      }
    } catch (e: any) {
      this.uploading = false;
      this.uploadError = e?.message || 'Failed to process dropped files.';
    }
  }

  // ---------------- In-App Drag to Move Dataset to Folder ----------------
  onDatasetDragStart(event: DragEvent, ds: IDataset): void {
    if (!this.isAdmin) return;
    this.draggedDataset = ds;
    this.draggedDatasetId = ds.id;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', ds.id);
      event.dataTransfer.setData('application/json', JSON.stringify({ id: ds.id, name: ds.originalName }));
    }
  }

  onDatasetDragEnd(): void {
    this.draggedDataset = null;
    this.draggedDatasetId = null;
    this.dragOverTargetFolder = null;
  }

  onFolderDragOver(event: DragEvent, folderPath: string): void {
    if (!this.isAdmin) return;
    event.preventDefault();
    event.stopPropagation();

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    this.dragOverTargetFolder = folderPath;
  }

  onFolderDragLeave(event: DragEvent, folderPath: string): void {
    if (this.dragOverTargetFolder === folderPath) {
      this.dragOverTargetFolder = null;
    }
  }

  async onFolderDrop(event: DragEvent, targetFolder: string): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    this.dragOverTargetFolder = null;

    if (!this.isAdmin) return;

    // Check if external OS file was dropped directly onto this folder
    const types = Array.from(event.dataTransfer?.types || []);
    if (types.includes('Files') && !this.draggedDataset && !this.draggedDatasetId) {
      this.isOsDragOver = false;
      await this.handleOsFilesDrop(event.dataTransfer!, targetFolder);
      return;
    }

    // In-App dataset movement
    let dsId = this.draggedDatasetId || this.draggedDataset?.id;
    if (!dsId && event.dataTransfer) {
      dsId = event.dataTransfer.getData('text/plain');
    }

    const ds = this.draggedDataset || this.datasets.find((d) => d.id === dsId);
    if (!ds) return;

    const currentFolder = ds.folder || '';
    if (currentFolder === targetFolder) return;

    const targetLabel = targetFolder || 'Root';
    this.api.updateDatasetFolder(ds.id, targetFolder).subscribe({
      next: (updated) => {
        const idx = this.datasets.findIndex((d) => d.id === updated.id);
        if (idx !== -1) {
          this.datasets[idx] = updated;
        }
        if (this.selectedDataset?.id === updated.id) {
          this.selectedDataset = updated;
        }
        this.rebuildFolders();
        this.showToast(`Moved "${ds.originalName}" to ${targetLabel}`);
      },
      error: (err) => {
        alert(err.error?.message || 'Failed to move dataset');
      },
    });
  }

  loadDatasets(): void {
    this.loading = true;
    this.api.getDatasets().subscribe({
      next: (dsList) => {
        this.datasets = dsList;
        this.rebuildFolders();
        if (this.datasets.length > 0 && !this.selectedDataset) {
          this.selectedDataset = this.datasets[0];
        }
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      },
    });
  }

  get activeFolderBreadcrumbs(): { name: string; path: string }[] {
    if (!this.activeFolder) return [];
    const segments = this.activeFolder.split('/').filter((s) => s.trim());
    const breadcrumbs: { name: string; path: string }[] = [];
    let currentPath = '';
    for (const seg of segments) {
      currentPath = currentPath ? `${currentPath}/${seg}` : seg;
      breadcrumbs.push({ name: seg, path: currentPath });
    }
    return breadcrumbs;
  }

  get currentSubfolders(): { name: string; fullPath: string; count: number }[] {
    const subMap = new Map<string, { name: string; fullPath: string; count: number }>();

    if (this.activeFolder === null || this.activeFolder === '') {
      // Top-level root folders
      for (const d of this.datasets) {
        if (d.folder && d.folder.trim()) {
          const rootSeg = d.folder.trim().split('/')[0];
          if (!subMap.has(rootSeg)) {
            subMap.set(rootSeg, {
              name: rootSeg,
              fullPath: rootSeg,
              count: this.getFolderCount(rootSeg),
            });
          }
        }
      }
      for (const f of this.availableFolders) {
        if (f && f.trim()) {
          const rootSeg = f.trim().split('/')[0];
          if (!subMap.has(rootSeg)) {
            subMap.set(rootSeg, {
              name: rootSeg,
              fullPath: rootSeg,
              count: this.getFolderCount(rootSeg),
            });
          }
        }
      }
    } else {
      // Inside activeFolder (e.g. "Sales")
      const prefix = this.activeFolder + '/';
      for (const d of this.datasets) {
        if (d.folder && d.folder.startsWith(prefix)) {
          const remainder = d.folder.slice(prefix.length);
          const childSeg = remainder.split('/')[0];
          const fullChildPath = `${this.activeFolder}/${childSeg}`;
          if (!subMap.has(childSeg)) {
            subMap.set(childSeg, {
              name: childSeg,
              fullPath: fullChildPath,
              count: this.getFolderCount(fullChildPath),
            });
          }
        }
      }
      for (const f of this.availableFolders) {
        if (f.startsWith(prefix)) {
          const remainder = f.slice(prefix.length);
          const childSeg = remainder.split('/')[0];
          const fullChildPath = `${this.activeFolder}/${childSeg}`;
          if (!subMap.has(childSeg)) {
            subMap.set(childSeg, {
              name: childSeg,
              fullPath: fullChildPath,
              count: this.getFolderCount(fullChildPath),
            });
          }
        }
      }
    }

    return Array.from(subMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  get filteredDatasets(): IDataset[] {
    if (this.activeFolder === null) {
      return this.datasets;
    }
    if (this.activeFolder === '') {
      return this.datasets.filter((d) => !d.folder || d.folder === '');
    }
    return this.datasets.filter(
      (d) => d.folder === this.activeFolder || (d.folder && d.folder.startsWith(this.activeFolder + '/'))
    );
  }

  getFolderCount(folderPath: string): number {
    return this.datasets.filter(
      (d) => d.folder === folderPath || (d.folder && d.folder.startsWith(folderPath + '/'))
    ).length;
  }

  selectDataset(ds: IDataset): void {
    this.selectedDataset = ds;
    this.activeSheetIndex = 0;
  }

  setActiveFolder(folder: string | null): void {
    this.activeFolder = folder;
  }

  createFolder(): void {
    if (!this.isAdmin || !this.newFolderName.trim()) return;
    const cleanName = this.newFolderName.trim().replace(/^\/+|\/+$/g, '');
    const finalPath = this.activeFolder ? `${this.activeFolder}/${cleanName}` : cleanName;

    if (!this.availableFolders.includes(finalPath)) {
      this.availableFolders.push(finalPath);
      this.availableFolders.sort();
      this.saveFolders();
    }

    const depts = [...this.newFolderDepartments];
    this.api.createFolder({ name: finalPath, allowedDepartments: depts }).subscribe({
      next: () => {
        this.showToast(`Folder "${finalPath}" created with ${depts.length > 0 ? depts.join(', ') : 'open'} access`);
      },
      error: (err) => console.error('Failed to create folder:', err),
    });

    this.newFolderName = '';
    this.newFolderDepartments = [];
    this.showNewFolderInput = false;
    this.setActiveFolder(finalPath);
  }

  async deleteFolder(folderPath: string): Promise<void> {
    if (!this.isAdmin) return;
    const count = this.getFolderCount(folderPath);
    const confirmed = await this.modal.confirmDanger(
      `Are you sure you want to delete folder "${folderPath}" (${count} dataset(s))?`,
      'Delete Folder',
      'Delete Folder'
    );
    if (!confirmed) return;

    this.availableFolders = this.availableFolders.filter(
      (f) => f !== folderPath && !f.startsWith(folderPath + '/')
    );
    this.saveFolders();

    for (const ds of this.datasets) {
      if (ds.folder === folderPath || (ds.folder && ds.folder.startsWith(folderPath + '/'))) {
        this.api.deleteDataset(ds.id).subscribe();
      }
    }
    this.datasets = this.datasets.filter(
      (d) => d.folder !== folderPath && !(d.folder && d.folder.startsWith(folderPath + '/'))
    );
    if (this.activeFolder === folderPath || (this.activeFolder && this.activeFolder.startsWith(folderPath + '/'))) {
      this.setActiveFolder(null);
    }
  }

  rebuildFolders(): void {
    const saved = this.loadSavedFolders();
    const set = new Set<string>([...this.availableFolders, ...saved]);
    for (const d of this.datasets) {
      if (d.folder && d.folder.trim()) {
        const parts = d.folder.trim().split('/');
        let cur = '';
        for (const p of parts) {
          cur = cur ? `${cur}/${p}` : p;
          set.add(cur);
        }
      }
    }
    this.availableFolders = Array.from(set).sort();
    this.saveFolders();
  }

  onFileSelected(event: Event): void {
    if (!this.isAdmin) {
      this.uploadError = 'Only administrators can upload datasets.';
      return;
    }
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    this.uploading = true;
    this.uploadError = '';

    const folderToUse = this.activeFolder || '';

    this.api.uploadDataset(file, folderToUse).subscribe({
      next: (ds) => {
        this.datasets.unshift(ds);
        this.rebuildFolders();
        this.selectedDataset = ds;
        this.uploading = false;
        input.value = '';
        this.showToast(`Uploaded "${ds.originalName}"`);
      },
      error: (err) => {
        this.uploading = false;
        this.uploadError = err.error?.message || 'Failed to upload dataset. Admin privileges required.';
        input.value = '';
      },
    });
  }

  retryDs(id: string): void {
    if (!this.isAdmin) return;
    this.api.retryDataset(id).subscribe({
      next: (ds) => {
        const idx = this.datasets.findIndex((d) => d.id === ds.id);
        if (idx !== -1) {
          this.datasets[idx] = ds;
        }
        if (this.selectedDataset?.id === ds.id) {
          this.selectedDataset = ds;
        }
      },
    });
  }

  async deleteDataset(id: string, event?: Event): Promise<void> {
    if (!this.isAdmin) return;
    if (event) event.stopPropagation();
    const confirmed = await this.modal.confirmDanger(
      'Are you sure you want to permanently delete this dataset?',
      'Delete Dataset',
      'Delete Dataset'
    );
    if (!confirmed) return;
    this.api.deleteDataset(id).subscribe({
      next: () => {
        this.datasets = this.datasets.filter((d) => d.id !== id);
        if (this.selectedDataset?.id === id) {
          this.selectedDataset = this.datasets[0] || null;
        }
        this.rebuildFolders();
        this.showToast('Dataset deleted');
      },
    });
  }

  async requestAccess(dsId: string, event?: Event): Promise<void> {
    if (event) event.stopPropagation();
    const reason = await this.modal.prompt(
      'Please enter a business justification for requesting access to this dataset:',
      'Request Dataset Access',
      '',
      'e.g. Need sales revenue data for Q1 forecast modeling'
    );
    if (!reason || !reason.trim()) return;
    this.api.createAccessRequest({ resourceId: dsId, resourceType: 'dataset', reason: reason.trim() }).subscribe({
      next: () => this.modal.alert('Access request submitted successfully to administrators.', 'Request Submitted'),
      error: (err) => this.modal.alert(err.error?.message || 'Failed to submit access request', 'Error'),
    });
  }
}
