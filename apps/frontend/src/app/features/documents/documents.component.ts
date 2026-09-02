import { Component, OnInit, OnDestroy, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { IDocument, DocumentStatus, ResourceType } from '@enter-chat/shared-types';
import { AuthService } from '../../core/services/auth.service';
import { ModalDialogService } from '../../core/services/modal-dialog.service';
import { extractDroppedFilesAndFolders } from '../../core/utils/drag-drop-folder.util';

@Component({
  selector: 'app-documents',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="relative p-4 sm:p-6 lg:p-8 w-full max-w-7xl mx-auto space-y-6 animate-fade-in text-zinc-200">
      <!-- OS Drag & Drop Full Area Dashed Overlay Cue (Admin Only) -->
      @if (isOsDragOver && isAdmin) {
        <div class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-8 pointer-events-none animate-fade-in">
          <div class="w-full max-w-2xl border-2 border-dashed border-zinc-500 rounded-2xl p-12 text-center space-y-4 bg-[#111114] shadow-2xl">
            <div class="w-14 h-14 rounded-xl bg-zinc-800 text-zinc-200 flex items-center justify-center mx-auto border border-zinc-700">
              <svg class="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <h2 class="text-lg font-semibold text-white tracking-tight">Drop files or folders to upload</h2>
            <p class="text-xs text-zinc-400 max-w-md mx-auto">
              {{ activeFolder ? 'Uploading into folder "' + activeFolder + '"' : 'Uploading to Root directory' }}
            </p>
          </div>
        </div>
      }

      <!-- Instant Top Notification Bar -->
      @if (toastMessage) {
        <div class="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-[#18181b] border border-zinc-700 text-white flex items-center gap-2.5 animate-fade-in">
          <div class="w-2 h-2 rounded-full bg-white"></div>
          <span class="text-xs font-medium tracking-wide text-zinc-200">{{ toastMessage }}</span>
        </div>
      }

      <!-- Sheet / Tabular Preview Modal -->
      @if (selectedTabularDoc) {
        <div
          class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 bg-black/80 backdrop-blur-sm animate-fade-in"
          (click)="closeTabularPreview()"
        >
          <div
            class="w-full max-w-5xl max-h-[88vh] bg-[#111114] border border-zinc-800 rounded-2xl flex flex-col overflow-hidden shadow-2xl"
            (click)="$event.stopPropagation()"
          >
            <!-- Modal Header -->
            <div class="flex items-center justify-between p-4 sm:p-5 border-b border-zinc-800">
              <div class="flex items-center gap-3 truncate">
                <div class="p-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 flex-shrink-0">
                  <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div class="truncate">
                  <h3 class="text-sm font-semibold text-white truncate">{{ selectedTabularDoc.originalName }}</h3>
                  <div class="flex items-center gap-2 text-xs text-zinc-400 mt-0.5 font-mono">
                    <span>{{ selectedTabularDoc.totalRows || 0 }} rows</span>
                    <span>•</span>
                    <span>{{ selectedTabularDoc.sheetNames?.length || 1 }} sheet(s)</span>
                  </div>
                </div>
              </div>
              <button (click)="closeTabularPreview()" class="text-zinc-400 hover:text-white p-1.5 rounded-lg hover:bg-zinc-800 transition-colors" title="Close (Esc)">
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <!-- Sheet Tabs (if multi-sheet) -->
            @if (selectedTabularDoc.sheets && selectedTabularDoc.sheets.length > 1) {
              <div class="flex items-center gap-2 px-5 pt-3 border-b border-zinc-800 overflow-x-auto bg-[#0a0a0d]">
                @for (sheet of selectedTabularDoc.sheets; track sheet.sheetName; let i = $index) {
                  <button
                    (click)="activeSheetIndex = i"
                    [ngClass]="activeSheetIndex === i ? 'text-white border-b-2 border-zinc-400 font-semibold' : 'text-zinc-400 hover:text-white'"
                    class="px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap"
                  >
                    {{ sheet.sheetName }} ({{ sheet.rowCount }} rows)
                  </button>
                }
              </div>
            }

            <!-- Sheet Data Content -->
            <div class="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              @if (currentActiveSheet) {
                <!-- Columns Schema Tags -->
                <div class="space-y-1.5">
                  <div class="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Detected Schema Columns</div>
                  <div class="flex flex-wrap gap-1.5">
                    @for (col of currentActiveSheet.columns; track col.name) {
                      <span class="px-2.5 py-1 rounded-md bg-[#18181b] border border-zinc-800 text-xs text-zinc-300 flex items-center gap-1.5">
                        <span class="font-medium text-zinc-200">{{ col.name }}</span>
                        <span class="text-[10px] font-mono text-zinc-400 bg-zinc-800 px-1 py-0.2 rounded border border-zinc-700">{{ col.dtype }}</span>
                      </span>
                    }
                  </div>
                </div>

                <!-- Preview Table -->
                <div class="space-y-1.5">
                  <div class="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Sample Data Preview</div>
                  <div class="border border-zinc-800 rounded-xl overflow-x-auto bg-[#09090b]">
                    <table class="w-full min-w-[600px] text-left text-xs font-mono">
                      <thead class="bg-[#141417] text-zinc-400 border-b border-zinc-800">
                        <tr>
                          @for (col of currentActiveSheet.columns; track col.name) {
                            <th class="px-3 py-2.5 whitespace-nowrap text-zinc-300 font-semibold">{{ col.name }}</th>
                          }
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-zinc-800/70">
                        @for (row of currentActiveSheet.previewRows; track $index) {
                          <tr class="hover:bg-zinc-800/40 transition-colors">
                            @for (col of currentActiveSheet.columns; track col.name) {
                              <td class="px-3 py-2 text-zinc-400 whitespace-nowrap max-w-[200px] truncate">
                                {{ row[col.name] !== undefined && row[col.name] !== null ? row[col.name] : '-' }}
                              </td>
                            }
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                </div>
              } @else {
                <div class="p-8 text-center text-zinc-500 text-sm">No tabular preview data available for this file.</div>
              }
            </div>
          </div>
        </div>
      }

      <!-- In-App Access Request Modal Dialog -->
      @if (showAccessModal && targetAccessItem) {
        <div
          class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
          (click)="closeAccessModal()"
        >
          <div
            class="w-full max-w-md bg-[#111114] border border-zinc-800 rounded-2xl shadow-2xl p-6 space-y-4"
            (click)="$event.stopPropagation()"
          >
            <div class="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div class="flex items-center gap-2.5">
                <div class="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300">
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <div>
                  <h3 class="text-sm font-semibold text-white">Request File Access</h3>
                  <p class="text-xs text-zinc-400 font-mono truncate max-w-xs">{{ targetAccessItem.name }}</p>
                </div>
              </div>
              <button (click)="closeAccessModal()" class="text-zinc-400 hover:text-white" title="Close (Esc)">
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div class="space-y-2">
              <label class="block text-xs font-medium text-zinc-400">Business Justification / Reason *</label>
              <textarea
                [(ngModel)]="accessReason"
                rows="3"
                placeholder="Explain why you need access to this file..."
                class="w-full px-3 py-2 rounded-xl bg-[#09090b] border border-zinc-800 text-xs text-white focus:outline-none focus:border-zinc-500 placeholder:text-zinc-600"
              ></textarea>
              @if (accessError) {
                <p class="text-[11px] text-zinc-300 font-mono">{{ accessError }}</p>
              }
            </div>

            <div class="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                (click)="closeAccessModal()"
                class="px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                (click)="submitAccessRequest()"
                [disabled]="submittingAccess || !accessReason.trim()"
                class="px-4 py-1.5 rounded-lg bg-white hover:bg-zinc-200 text-black text-xs font-semibold transition-colors disabled:opacity-50"
              >
                {{ submittingAccess ? 'Submitting...' : 'Submit Request' }}
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Move Document to Folder Modal -->
      @if (showMoveModal && moveTargetDoc) {
        <div
          class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
          (click)="closeMoveModal()"
        >
          <div
            class="w-full max-w-md bg-[#111114] border border-zinc-800 rounded-2xl shadow-2xl p-6 space-y-4"
            (click)="$event.stopPropagation()"
          >
            <div class="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div class="flex items-center gap-2.5">
                <div class="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300">
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                </div>
                <div>
                  <h3 class="text-sm font-semibold text-white">Move File to Folder</h3>
                  <p class="text-xs text-zinc-400 font-mono truncate max-w-xs">{{ moveTargetDoc.originalName }}</p>
                </div>
              </div>
              <button (click)="closeMoveModal()" class="text-zinc-400 hover:text-white" title="Close (Esc)">
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div class="space-y-2">
              <label class="block text-xs font-medium text-zinc-400">Select Destination Folder</label>
              <select
                [(ngModel)]="moveSelectedFolder"
                class="w-full px-3 py-2.5 rounded-xl bg-[#09090b] border border-zinc-800 text-xs text-white focus:outline-none focus:border-zinc-500"
              >
                <option value="">Root / Unfiled</option>
                @for (f of availableFolderList; track f) {
                  <option [value]="f">{{ f }}</option>
                }
              </select>
            </div>

            <div class="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                (click)="closeMoveModal()"
                class="px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                (click)="executeMove()"
                class="px-4 py-1.5 rounded-lg bg-white hover:bg-zinc-200 text-black text-xs font-semibold transition-colors"
              >
                Move File
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Page Header -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800/80 pb-6">
        <div>
          <div class="flex items-center gap-3">
            <h1 class="text-2xl font-bold text-white tracking-tight">Files & Knowledge</h1>
            <span class="px-2.5 py-0.5 rounded-md bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-400">
              {{ documents.length }} items
            </span>
          </div>
          <p class="text-xs sm:text-sm text-zinc-400 mt-1 max-w-2xl">
            Unified knowledge repository for enterprise documents, policies, datasets, and spreadsheets.
          </p>
        </div>
        <div class="flex items-center gap-2.5 flex-wrap">
          @if (isAdmin) {
            @if (activeFolder) {
              <button
                (click)="deleteFolder(activeFolder)"
                class="px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-xs font-medium transition-colors flex items-center gap-1.5"
                title="Delete this folder"
              >
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <span>Delete Folder</span>
              </button>
            }

            <button
              (click)="showNewFolderInput = !showNewFolderInput"
              class="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 hover:text-white border border-zinc-800 text-xs font-medium transition-colors flex items-center gap-2"
            >
              <svg class="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h5l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              </svg>
              <span>+ New Folder</span>
            </button>
    
            <label class="px-4 py-2 rounded-xl bg-white hover:bg-zinc-200 text-black font-semibold text-xs transition-colors cursor-pointer inline-flex items-center gap-2">
              <svg class="w-4 h-4 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              <span>{{ uploading ? 'Uploading...' : (activeFolder ? 'Upload to ' + activeFolder : 'Upload Files') }}</span>
              <input type="file" (change)="onFileSelected($event)" accept=".pdf,.docx,.txt,.md,.json,.csv,.xlsx,.xls" class="hidden" [disabled]="uploading" />
            </label>
          }
        </div>
      </div>

      <!-- Quick New Folder Input Bar -->
      @if (showNewFolderInput && isAdmin) {
        <div class="p-5 rounded-2xl bg-[#111114] border border-zinc-800 space-y-4 animate-fade-in">
          <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div class="flex items-center gap-2 flex-1">
              <svg class="w-5 h-5 text-zinc-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              @if (activeFolder) {
                <span class="text-xs text-zinc-400 font-mono bg-[#09090b] px-2.5 py-1.5 rounded-lg border border-zinc-800">
                  {{ activeFolder }}/
                </span>
              }
              <input
                type="text"
                [(ngModel)]="newFolderName"
                (keydown.enter)="createFolder()"
                [placeholder]="activeFolder ? 'Enter subfolder name (e.g. Reports)...' : 'Enter folder name (e.g. Policies, Finance)...'"
                class="flex-1 px-3 py-2 rounded-xl bg-[#09090b] border border-zinc-800 text-xs sm:text-sm text-white focus:outline-none focus:border-zinc-500 placeholder:text-zinc-600"
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
                class="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>

          <!-- Department Multi-Select Chips -->
          <div class="pt-3 border-t border-zinc-800/80 space-y-2">
            <div class="flex items-center justify-between">
              <label class="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                <span>Assign Department Access</span>
                <span class="text-[10px] text-zinc-500 font-normal">• Members of selected departments get access</span>
              </label>
              @if (newFolderDepartments.length > 0) {
                <span class="text-[11px] text-zinc-300 font-mono">{{ newFolderDepartments.length }} selected</span>
              } @else {
                <span class="text-[11px] text-zinc-500">Unrestricted</span>
              }
            </div>
            <div class="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
              @for (dept of standardDepartments; track dept) {
                <button
                  type="button"
                  (click)="toggleNewFolderDept(dept)"
                  [ngClass]="newFolderDepartments.includes(dept) ? 'bg-zinc-200 text-black font-semibold border-zinc-200' : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white hover:border-zinc-700'"
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
        <div class="p-3.5 rounded-xl bg-zinc-900 border border-zinc-800 text-rose-300 text-xs flex items-center justify-between">
          <span>{{ uploadError }}</span>
          <button (click)="uploadError = ''" class="hover:underline font-bold">Dismiss</button>
        </div>
      }

      <!-- Interactive Toolbar: Breadcrumb Navigation & Search Filter -->
      <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#111114] p-2.5 rounded-2xl border border-zinc-800">
        <!-- Breadcrumbs Trail -->
        <div class="flex items-center gap-1.5 text-xs text-zinc-400 overflow-x-auto px-1 py-0.5">
          <button
            (click)="setActiveFolder(null)"
            (dragover)="onFolderDragOver($event, '')"
            (dragleave)="onFolderDragLeave($event, '')"
            (drop)="onFolderDrop($event, '')"
            [ngClass]="activeFolder === null ? 'text-black font-semibold bg-white' : (dragOverTargetFolder === '' ? 'border-zinc-500 bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white bg-zinc-900 border-zinc-800 hover:bg-zinc-800')"
            class="px-3 py-1.5 rounded-xl transition-all font-medium flex items-center gap-1.5 border border-transparent"
          >
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span>All Files</span>
          </button>

          @for (segment of breadcrumbSegments; track segment.path) {
            <span class="text-zinc-600 font-mono">/</span>
            <button
              (click)="setActiveFolder(segment.path)"
              (dragover)="onFolderDragOver($event, segment.path)"
              (dragleave)="onFolderDragLeave($event, segment.path)"
              (drop)="onFolderDrop($event, segment.path)"
              [ngClass]="activeFolder === segment.path ? 'text-white font-semibold bg-zinc-800 border-zinc-700' : 'text-zinc-400 hover:text-white bg-zinc-900 border-zinc-800'"
              class="px-3 py-1.5 rounded-xl transition-all border font-medium"
            >
              {{ segment.name }}
            </button>
          }
        </div>

        <!-- Controls: Sort Select & Search Input Filter -->
        <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-shrink-0 w-full sm:w-auto">
          <!-- Sort Dropdown -->
          <div class="relative flex items-center">
            <label class="sr-only" for="documentsSort">Sort documents</label>
            <select
              id="documentsSort"
              [(ngModel)]="selectedSort"
              class="w-full sm:w-auto px-3 py-1.5 rounded-xl bg-[#09090b] border border-zinc-800 text-xs text-zinc-300 focus:outline-none focus:border-zinc-600 transition-colors cursor-pointer min-h-[36px]"
              aria-label="Sort documents"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name_asc">Name A → Z</option>
              <option value="name_desc">Name Z → A</option>
            </select>
          </div>

          <!-- Search Input Filter -->
          <div class="relative w-full sm:w-64">
            <input
              type="text"
              [(ngModel)]="searchQuery"
              placeholder="Search files or formats..."
              class="w-full pl-8 pr-7 py-1.5 rounded-xl bg-[#09090b] border border-zinc-800 text-xs text-white focus:outline-none focus:border-zinc-600 placeholder:text-zinc-600 transition-colors min-h-[36px]"
            />
            <svg class="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            @if (searchQuery) {
              <button (click)="searchQuery = ''" class="absolute right-2 top-2 text-zinc-500 hover:text-white text-xs font-bold">×</button>
            }
          </div>
        </div>
      </div>

      <!-- Quick Subfolders Grid Cards -->
      @if (currentSubfolders.length > 0) {
        <div class="space-y-2.5">
          <div class="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5 px-1">
            <svg class="w-3.5 h-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <span>{{ activeFolder ? 'Subfolders in ' + activeFolder : 'Folders' }} ({{ currentSubfolders.length }})</span>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            @for (sub of currentSubfolders; track sub.fullPath) {
              <div
                (click)="setActiveFolder(sub.fullPath)"
                (dragover)="onFolderDragOver($event, sub.fullPath)"
                (dragleave)="onFolderDragLeave($event, sub.fullPath)"
                (drop)="onFolderDrop($event, sub.fullPath)"
                [ngClass]="dragOverTargetFolder === sub.fullPath ? 'border-zinc-500 bg-zinc-800' : 'border-zinc-800/80 bg-[#111114] hover:border-zinc-700 hover:bg-[#161619]'"
                class="group p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between"
              >
                <div class="flex items-center gap-2.5 truncate">
                  <div class="w-7 h-7 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 flex-shrink-0">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                  </div>
                  <div class="truncate">
                    <div class="text-xs font-medium text-zinc-200 truncate group-hover:text-white">{{ sub.name }}</div>
                    <div class="text-[10px] text-zinc-500 font-mono">{{ sub.count }} file{{ sub.count === 1 ? '' : 's' }}</div>
                  </div>
                </div>

                <button
                  *ngIf="isAdmin"
                  (click)="$event.stopPropagation(); deleteFolder(sub.fullPath)"
                  class="opacity-0 group-hover:opacity-100 hover:text-rose-400 transition-opacity p-1 rounded-lg hover:bg-zinc-800 text-zinc-500"
                  title="Delete folder"
                >
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            }
          </div>
        </div>
      }

      <!-- Unified Documents & Datasets Table -->
      <div class="bg-[#111114] border border-zinc-800/80 rounded-2xl overflow-hidden shadow-sm">
        @if (loading) {
          <div class="p-16 text-center text-zinc-500 text-sm flex flex-col items-center justify-center gap-3">
            <div class="w-5 h-5 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin"></div>
            <span>Loading files & documents...</span>
          </div>
        } @else if (filteredDocuments.length === 0) {
          <div class="p-16 text-center space-y-3">
            <div class="w-12 h-12 rounded-xl bg-zinc-800/60 border border-zinc-700 text-zinc-400 flex items-center justify-center mx-auto">
              <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 class="text-sm font-semibold text-white">No files found</h3>
            <p class="text-xs text-zinc-500 max-w-sm mx-auto">
              {{ searchQuery ? 'No files match your search query.' : (isAdmin ? 'Upload or drag and drop PDFs, spreadsheets, Word docs, or CSVs directly here.' : 'No files have been made available in this folder yet.') }}
            </p>
          </div>
        } @else {
          <!-- Desktop Documents Table (>= 768px) -->
          <div class="hidden md:block overflow-x-auto w-full">
            <table class="w-full min-w-[880px] text-left text-xs">
              <thead class="bg-[#09090b] text-zinc-400 text-[11px] font-semibold uppercase tracking-wider border-b border-zinc-800">
                <tr>
                  <th class="px-5 py-3.5 min-w-[200px]">File Name</th>
                  <th class="px-4 py-3.5 min-w-[110px]">Folder</th>
                  <th class="px-3 py-3.5 text-center min-w-[75px]">Format</th>
                  <th class="px-4 py-3.5 min-w-[105px]">Status</th>
                  <th class="px-4 py-3.5 font-mono min-w-[110px]">Chunks / Rows</th>
                  <th class="px-4 py-3.5 font-mono min-w-[80px]">Size</th>
                  <th class="px-4 py-3.5 min-w-[110px]">Uploaded</th>
                  <th class="px-5 py-3.5 text-right min-w-[150px]">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-zinc-800/60">
                @for (doc of filteredDocuments; track doc.id) {
                  <tr
                    [draggable]="isAdmin"
                    (dragstart)="onDocDragStart($event, doc)"
                    (dragend)="onDocDragEnd()"
                    class="hover:bg-zinc-800/30 transition-colors cursor-pointer group"
                    [ngClass]="[
                      isAdmin ? 'active:cursor-grabbing select-none' : '',
                      !doc.hasAccess ? 'opacity-60 bg-black/20' : ''
                    ]"
                    (click)="onRowClick(doc)"
                  >
                    <!-- File Name with Icon -->
                    <td class="px-5 py-3.5">
                      <div class="flex items-center gap-3">
                        @if (!doc.hasAccess) {
                          <span class="p-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-500" title="Access Locked">
                            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                          </span>
                        } @else {
                          <div class="w-6 h-6 rounded bg-zinc-800 border border-zinc-700/70 flex items-center justify-center text-zinc-400 flex-shrink-0">
                            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </div>
                        }
                        <div class="font-medium text-zinc-200 truncate max-w-xs md:max-w-md group-hover:text-white transition-colors" [title]="doc.originalName">
                          {{ doc.originalName }}
                        </div>
                      </div>
                    </td>

                    <!-- Folder Pill -->
                    <td class="px-4 py-3.5">
                      <span class="inline-flex items-center gap-1 text-[11px] text-zinc-400 font-mono bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                        <span class="truncate max-w-[130px]">{{ doc.folder ? doc.folder : 'Root' }}</span>
                      </span>
                    </td>

                    <!-- Format Badge -->
                    <td class="px-3 py-3.5 text-center">
                      <span class="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-zinc-800/80 text-zinc-300 border border-zinc-700 font-medium">
                        {{ doc.fileType }}
                      </span>
                    </td>

                    <!-- Status -->
                    <td class="px-4 py-3.5">
                      @if (doc.status === DocumentStatus.READY) {
                        <span class="inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-0.5 rounded-md bg-zinc-900 text-zinc-200 border border-zinc-800 font-semibold">
                          <svg class="w-3 h-3 text-zinc-300" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                          </svg>
                          Ready
                        </span>
                      } @else if (doc.status === DocumentStatus.PROCESSING) {
                        <span class="inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-0.5 rounded-md bg-zinc-900 text-zinc-300 border border-zinc-800 font-semibold">
                          <span class="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
                          Processing
                        </span>
                      } @else {
                        <div class="inline-flex items-center gap-1.5">
                          <span class="inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-0.5 rounded-md bg-zinc-900 text-zinc-400 border border-zinc-800 font-semibold">
                            <span class="w-1.5 h-1.5 rounded-full border border-zinc-500"></span>
                            Failed
                          </span>
                          <button
                            *ngIf="isAdmin"
                            (click)="$event.stopPropagation(); retryDoc(doc.id)"
                            class="px-2 py-0.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-white text-[10px] border border-zinc-700 transition-colors"
                            title="Retry AI ingestion"
                          >
                            Retry
                          </button>
                        </div>
                      }
                    </td>

                    <!-- Chunks / Rows -->
                    <td class="px-4 py-3.5 font-mono text-zinc-400">
                      @if (isTabular(doc)) {
                        <span>{{ doc.totalRows || 0 }} rows</span>
                      } @else {
                        <span>{{ doc.chunkCount || 0 }} chunks</span>
                      }
                    </td>

                    <!-- File Size -->
                    <td class="px-4 py-3.5 font-mono text-zinc-400">
                      {{ (doc.fileSize / 1024).toFixed(1) }} KB
                    </td>

                    <!-- Upload Date -->
                    <td class="px-4 py-3.5 text-zinc-400 whitespace-nowrap">
                      {{ doc.createdAt | date:'mediumDate' }}
                    </td>

                    <!-- Actions -->
                    <td class="px-5 py-3.5 text-right whitespace-nowrap space-x-1.5" (click)="$event.stopPropagation()">
                      @if (doc.hasAccess) {
                        @if (isTabular(doc) && doc.sheets && doc.sheets.length > 0) {
                          <button
                            (click)="openTabularPreview(doc)"
                            class="text-zinc-200 hover:text-white px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-medium transition-colors"
                            title="Preview spreadsheet schema and sample data"
                          >
                            Preview
                          </button>
                        }
                        <button
                          *ngIf="isAdmin"
                          (click)="triggerReplace(doc, replaceFileInput)"
                          class="text-zinc-300 hover:text-white px-2.5 py-1 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700 text-xs font-medium transition-colors"
                          title="Replace file with updated version"
                        >
                          Replace
                        </button>
                        <button
                          *ngIf="isAdmin"
                          (click)="openMoveModal(doc)"
                          class="text-zinc-300 hover:text-white px-2.5 py-1 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700 text-xs font-medium transition-colors"
                          title="Move file to folder"
                        >
                          Move
                        </button>
                        <button
                          *ngIf="isAdmin"
                          (click)="deleteDoc(doc.id)"
                          class="text-zinc-500 hover:text-white p-1.5 rounded-lg hover:bg-zinc-800 transition-colors inline-flex items-center"
                          title="Delete file"
                        >
                          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                        <span *ngIf="!isAdmin" class="text-[11px] text-zinc-500 font-mono">Granted</span>
                      } @else {
                        @if (doc.requestStatus === 'pending') {
                          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-400 font-mono">
                            Pending
                          </span>
                        } @else {
                          <button
                            (click)="openAccessModal(doc)"
                            class="px-2.5 py-1 bg-white hover:bg-zinc-200 text-black rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5"
                          >
                            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                            <span>Request Access</span>
                          </button>
                        }
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <!-- Mobile Documents Card List (< 768px) -->
          <div class="block md:hidden divide-y divide-zinc-800/80">
            @for (doc of filteredDocuments; track doc.id) {
              <div
                class="p-4 space-y-3 transition-colors"
                [ngClass]="!doc.hasAccess ? 'opacity-60 bg-black/20' : 'hover:bg-zinc-800/20'"
                (click)="onRowClick(doc)"
              >
                <!-- Header: Icon, Name, Format -->
                <div class="flex items-start justify-between gap-2.5">
                  <div class="flex items-center gap-2.5 min-w-0">
                    <div class="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700/70 flex items-center justify-center text-zinc-300 flex-shrink-0">
                      @if (!doc.hasAccess) {
                        <svg class="w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      } @else {
                        <svg class="w-4 h-4 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      }
                    </div>
                    <div class="truncate">
                      <div class="font-medium text-white text-sm truncate" [title]="doc.originalName">
                        {{ doc.originalName }}
                      </div>
                      <div class="flex items-center gap-1.5 text-[11px] text-zinc-400 font-mono mt-0.5">
                        <span>📁 {{ doc.folder ? doc.folder : 'Root' }}</span>
                        <span>•</span>
                        <span>{{ (doc.fileSize / 1024).toFixed(1) }} KB</span>
                      </div>
                    </div>
                  </div>

                  <span class="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 font-medium flex-shrink-0">
                    {{ doc.fileType }}
                  </span>
                </div>

                <!-- Status & Chunks/Rows Row -->
                <div class="flex items-center justify-between text-xs font-mono pt-1">
                  <div>
                    @if (doc.status === DocumentStatus.READY) {
                      <span class="inline-flex items-center gap-1 text-[11px] text-zinc-200">
                        <span class="w-1.5 h-1.5 rounded-full bg-white"></span>
                        Ready
                      </span>
                    } @else if (doc.status === DocumentStatus.PROCESSING) {
                      <span class="inline-flex items-center gap-1 text-[11px] text-zinc-300">
                        <span class="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
                        Processing
                      </span>
                    } @else {
                      <span class="inline-flex items-center gap-1 text-[11px] text-zinc-400">
                        <span class="w-1.5 h-1.5 rounded-full border border-zinc-500"></span>
                        Failed
                      </span>
                    }
                  </div>

                  <div class="text-zinc-400">
                    @if (isTabular(doc)) {
                      <span>{{ doc.totalRows || 0 }} rows</span>
                    } @else {
                      <span>{{ doc.chunkCount || 0 }} chunks</span>
                    }
                  </div>
                </div>

                <!-- Actions Grid for Mobile -->
                <div class="pt-2 border-t border-zinc-800/80 flex items-center gap-2 flex-wrap" (click)="$event.stopPropagation()">
                  @if (doc.hasAccess) {
                    @if (isTabular(doc) && doc.sheets && doc.sheets.length > 0) {
                      <button
                        (click)="openTabularPreview(doc)"
                        class="min-h-[40px] px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700 flex items-center justify-center gap-1 flex-1"
                      >
                        Preview
                      </button>
                    }
                    @if (isAdmin) {
                      <button
                        (click)="triggerReplace(doc, replaceFileInput)"
                        class="min-h-[40px] px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700 flex items-center justify-center gap-1 flex-1"
                      >
                        Replace
                      </button>
                      <button
                        (click)="openMoveModal(doc)"
                        class="min-h-[40px] px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700 flex items-center justify-center gap-1 flex-1"
                      >
                        Move
                      </button>
                      <button
                        (click)="deleteDoc(doc.id)"
                        class="min-w-[40px] min-h-[40px] p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800 flex items-center justify-center"
                        title="Delete file"
                      >
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    }
                  } @else {
                    @if (doc.requestStatus === 'pending') {
                      <span class="w-full text-center py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-400 font-mono">
                        Access Request Pending
                      </span>
                    } @else {
                      <button
                        (click)="openAccessModal(doc)"
                        class="w-full min-h-[44px] px-4 py-2 bg-white hover:bg-zinc-200 text-black rounded-xl text-xs font-semibold flex items-center justify-center gap-2"
                      >
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                        <span>Request Access</span>
                      </button>
                    }
                  }
                </div>
              </div>
            }
          </div>
        }
      </div>

      <!-- Hidden File Picker for File Replacement -->
      <input #replaceFileInput type="file" (change)="onReplaceFileSelected($event)" accept=".pdf,.docx,.txt,.md,.json,.csv,.xlsx,.xls" class="hidden" />
    </div>
  `,
})
export class DocumentsComponent implements OnInit, OnDestroy {
  private readonly apiService = inject(ApiService);
  private readonly authService = inject(AuthService);
  private readonly modal = inject(ModalDialogService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly DocumentStatus = DocumentStatus;

  documents: IDocument[] = [];
  loading = true;
  uploading = false;
  uploadError = '';
  toastMessage = '';
  searchQuery = '';
  selectedSort: 'newest' | 'oldest' | 'name_asc' | 'name_desc' = 'newest';

  activeFolder: string | null = null;
  private routeSub?: Subscription;
  showNewFolderInput = false;
  newFolderName = '';
  newFolderDepartments: string[] = [];

  readonly standardDepartments: string[] = [
    'Engineering',
    'Product',
    'Design',
    'Marketing',
    'Sales',
    'Finance',
    'Legal',
    'HR',
    'Operations',
    'Executive',
  ];

  isOsDragOver = false;
  private osDragCounter = 0;
  dragOverTargetFolder: string | null = null;
  draggedDoc: IDocument | null = null;

  showMoveModal = false;
  moveTargetDoc: IDocument | null = null;
  moveSelectedFolder = '';

  showAccessModal = false;
  targetAccessItem: { id: string; name: string; type: ResourceType } | null = null;
  accessReason = '';
  submittingAccess = false;
  accessError = '';

  selectedTabularDoc: IDocument | null = null;
  activeSheetIndex = 0;

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(_event: KeyboardEvent): void {
    if (this.selectedTabularDoc) {
      this.closeTabularPreview();
      return;
    }
    if (this.showMoveModal) {
      this.closeMoveModal();
      return;
    }
    if (this.showAccessModal) {
      this.closeAccessModal();
      return;
    }
    if (this.showNewFolderInput) {
      this.showNewFolderInput = false;
      this.newFolderName = '';
      this.newFolderDepartments = [];
      return;
    }
  }

  get currentUser() {
    return this.authService.currentUser();
  }

  get isAdmin(): boolean {
    return this.authService.isAdmin();
  }

  get availableFolderList(): string[] {
    const folders = new Set<string>();
    for (const doc of this.documents) {
      if (doc.folder && doc.folder.trim()) {
        folders.add(doc.folder.trim());
      }
    }
    return Array.from(folders).sort();
  }

  get breadcrumbSegments(): { name: string; path: string }[] {
    if (!this.activeFolder) return [];
    const parts = this.activeFolder.split('/').filter(Boolean);
    const segments: { name: string; path: string }[] = [];
    let currentPath = '';
    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      segments.push({ name: part, path: currentPath });
    }
    return segments;
  }

  get currentSubfolders(): { name: string; fullPath: string; count: number }[] {
    const subfolderMap = new Map<string, { fullPath: string; count: number }>();
    const currentPrefix = this.activeFolder ? `${this.activeFolder}/` : '';

    for (const doc of this.documents) {
      const folder = doc.folder ? doc.folder.trim() : '';
      if (!folder) continue;

      if (!this.activeFolder) {
        const topLevel = folder.split('/')[0];
        const existing = subfolderMap.get(topLevel);
        if (existing) {
          existing.count++;
        } else {
          subfolderMap.set(topLevel, { fullPath: topLevel, count: 1 });
        }
      } else if (folder.startsWith(currentPrefix)) {
        const remainder = folder.slice(currentPrefix.length);
        const directChild = remainder.split('/')[0];
        const fullChildPath = `${currentPrefix}${directChild}`;
        const existing = subfolderMap.get(directChild);
        if (existing) {
          existing.count++;
        } else {
          subfolderMap.set(directChild, { fullPath: fullChildPath, count: 1 });
        }
      }
    }

    return Array.from(subfolderMap.entries()).map(([name, data]) => ({
      name,
      fullPath: data.fullPath,
      count: data.count,
    })).sort((a, b) => a.name.localeCompare(b.name));
  }

  get filteredDocuments(): IDocument[] {
    let docs = [...this.documents];

    // 1. Folder filtering
    if (this.activeFolder !== null) {
      docs = docs.filter((doc) => {
        const folder = doc.folder ? doc.folder.trim() : '';
        return folder === this.activeFolder;
      });
    }

    // 2. Search query filtering
    if (this.searchQuery && this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase().trim();
      docs = docs.filter(
        (doc) =>
          doc.originalName?.toLowerCase().includes(q) ||
          doc.fileType?.toLowerCase().includes(q) ||
          doc.folder?.toLowerCase().includes(q)
      );
    }

    // 3. Client-side sorting
    const getUploadTimestamp = (doc: IDocument): number => {
      const val = doc.uploadedAt || doc.createdAt || doc.updatedAt || 0;
      const t = new Date(val).getTime();
      return isNaN(t) ? 0 : t;
    };

    const getDocName = (doc: IDocument): string => (doc.originalName || doc.filename || '').toLowerCase();

    switch (this.selectedSort) {
      case 'oldest':
        docs.sort((a, b) => getUploadTimestamp(a) - getUploadTimestamp(b));
        break;
      case 'name_asc':
        docs.sort((a, b) => getDocName(a).localeCompare(getDocName(b)));
        break;
      case 'name_desc':
        docs.sort((a, b) => getDocName(b).localeCompare(getDocName(a)));
        break;
      case 'newest':
      default:
        docs.sort((a, b) => getUploadTimestamp(b) - getUploadTimestamp(a));
        break;
    }

    return docs;
  }

  get currentActiveSheet(): any | null {
    if (!this.selectedTabularDoc || !this.selectedTabularDoc.sheets || this.selectedTabularDoc.sheets.length === 0) {
      return null;
    }
    return this.selectedTabularDoc.sheets[this.activeSheetIndex] || this.selectedTabularDoc.sheets[0];
  }

  ngOnInit(): void {
    this.routeSub = this.route.queryParams.subscribe((params) => {
      const folderParam = params['folder'];
      const normalized = folderParam && typeof folderParam === 'string' && folderParam.trim() ? folderParam.trim() : null;
      this.activeFolder = normalized;
    });
    this.loadDocuments();
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }

  isTabular(doc: IDocument): boolean {
    const ext = (doc.fileType || '').toLowerCase();
    return ['csv', 'xlsx', 'xls'].includes(ext) || doc.sourceType === 'tabular' || !!(doc.sheets && doc.sheets.length > 0);
  }

  onRowClick(doc: IDocument): void {
    if (this.isTabular(doc) && doc.hasAccess) {
      this.openTabularPreview(doc);
    }
  }

  openTabularPreview(doc: IDocument): void {
    this.selectedTabularDoc = doc;
    this.activeSheetIndex = 0;
  }

  closeTabularPreview(): void {
    this.selectedTabularDoc = null;
    this.activeSheetIndex = 0;
  }

  loadDocuments(): void {
    this.loading = true;
    this.apiService.getDocuments().subscribe({
      next: (docs) => {
        this.documents = docs;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      },
    });
  }

  setActiveFolder(folder: string | null): void {
    const target = folder && folder.trim() ? folder.trim() : null;
    if (this.activeFolder === target) return;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { folder: target },
    });
  }

  toggleNewFolderDept(dept: string): void {
    const idx = this.newFolderDepartments.indexOf(dept);
    if (idx >= 0) {
      this.newFolderDepartments.splice(idx, 1);
    } else {
      this.newFolderDepartments.push(dept);
    }
  }

  createFolder(): void {
    if (!this.newFolderName.trim()) return;
    const name = this.activeFolder ? `${this.activeFolder}/${this.newFolderName.trim()}` : this.newFolderName.trim();
    this.apiService.createFolder(name, this.newFolderDepartments).subscribe({
      next: () => {
        this.showNewFolderInput = false;
        this.newFolderName = '';
        this.newFolderDepartments = [];
        this.setActiveFolder(name);
        this.triggerToast(`Folder "${name}" created`);
        this.loadDocuments();
      },
      error: (err) => {
        this.uploadError = err.error?.message || 'Failed to create folder';
      },
    });
  }

  async deleteFolder(folder: string): Promise<void> {
    const confirmed = await this.modal.confirmDanger(
      `Are you sure you want to delete the folder "${folder}"? Files will be unassigned from this folder.`,
      'Delete Folder',
      'Delete Folder'
    );
    if (!confirmed) return;
    this.apiService.deleteFolder(folder).subscribe({
      next: () => {
        if (this.activeFolder === folder || (this.activeFolder && this.activeFolder.startsWith(folder + '/'))) {
          this.setActiveFolder(null);
        }
        this.triggerToast(`Folder "${folder}" deleted`);
        this.loadDocuments();
      },
      error: (err) => {
        this.uploadError = err.error?.message || 'Failed to delete folder';
      },
    });
  }

  replacingDoc: IDocument | null = null;

  async triggerReplace(doc: IDocument, fileInput: HTMLInputElement): Promise<void> {
    const confirmed = await this.modal.confirmDanger(
      `Your current file "${doc.originalName}" will be replaced with the selected file. Existing permissions, folder placement, and citations will be preserved.`,
      `Replace ${doc.originalName}?`,
      'Choose Replacement'
    );
    if (!confirmed) return;
    this.replacingDoc = doc;
    fileInput.click();
  }

  onReplaceFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0 || !this.replacingDoc) {
      this.replacingDoc = null;
      input.value = '';
      return;
    }
    const file = input.files[0];
    const docToReplace = this.replacingDoc;
    this.replacingDoc = null;
    input.value = '';

    this.executeReplace(docToReplace, file);
  }

  executeReplace(doc: IDocument, file: File): void {
    const docName = doc.originalName;
    this.triggerToast(`Replacing "${docName}"...`);

    // Optimistic status update
    doc.status = DocumentStatus.PROCESSING;

    this.apiService.replaceDocument(doc.id, file).subscribe({
      next: () => {
        this.triggerToast(`Successfully replaced "${docName}"`);
        this.loadDocuments();
      },
      error: (err) => {
        this.uploadError = err.error?.message || 'Replacement failed. Your existing file was not changed.';
        this.loadDocuments();
      },
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    this.uploadFile(file);
    input.value = '';
  }

  uploadFile(file: File): void {
    this.uploading = true;
    this.uploadError = '';
    this.apiService.uploadDocument(file, this.activeFolder || undefined).subscribe({
      next: (doc) => {
        this.uploading = false;
        this.triggerToast(`Uploaded "${doc?.originalName || file.name}"`);
        this.loadDocuments();
      },
      error: (err) => {
        this.uploading = false;
        this.uploadError = err.error?.message || 'Failed to upload document';
      },
    });
  }

  retryDoc(id: string): void {
    this.apiService.retryDocument(id).subscribe({
      next: () => {
        this.triggerToast('Retrying document processing...');
        this.loadDocuments();
      },
      error: (err) => {
        this.uploadError = err.error?.message || 'Failed to retry document';
      },
    });
  }

  async deleteDoc(id: string): Promise<void> {
    const confirmed = await this.modal.confirmDanger(
      'Are you sure you want to permanently delete this document?',
      'Delete Document',
      'Delete Document'
    );
    if (!confirmed) return;
    this.apiService.deleteDocument(id).subscribe({
      next: () => {
        this.triggerToast('Document deleted');
        this.loadDocuments();
      },
      error: (err) => {
        this.uploadError = err.error?.message || 'Failed to delete document';
      },
    });
  }

  openMoveModal(doc: IDocument): void {
    this.moveTargetDoc = doc;
    this.moveSelectedFolder = doc.folder || '';
    this.showMoveModal = true;
  }

  closeMoveModal(): void {
    this.showMoveModal = false;
    this.moveTargetDoc = null;
    this.moveSelectedFolder = '';
  }

  executeMove(): void {
    if (!this.moveTargetDoc) return;
    this.apiService.updateDocumentFolder(this.moveTargetDoc.id, this.moveSelectedFolder).subscribe({
      next: () => {
        this.triggerToast(`Moved "${this.moveTargetDoc?.originalName}"`);
        this.closeMoveModal();
        this.loadDocuments();
      },
      error: (err) => {
        this.uploadError = err.error?.message || 'Failed to move document';
      },
    });
  }

  openAccessModal(doc: IDocument): void {
    this.targetAccessItem = { id: doc.id, name: doc.originalName, type: ResourceType.DOCUMENT };
    this.accessReason = '';
    this.accessError = '';
    this.showAccessModal = true;
  }

  closeAccessModal(): void {
    this.showAccessModal = false;
    this.targetAccessItem = null;
    this.accessReason = '';
    this.accessError = '';
  }

  submitAccessRequest(): void {
    if (!this.targetAccessItem || !this.accessReason.trim()) return;
    this.submittingAccess = true;
    this.accessError = '';
    this.apiService.createAccessRequest({
      resourceType: this.targetAccessItem.type,
      resourceId: this.targetAccessItem.id,
      reason: this.accessReason.trim(),
    }).subscribe({
      next: () => {
        this.submittingAccess = false;
        this.triggerToast('Access request submitted to administrators');
        this.closeAccessModal();
        this.loadDocuments();
      },
      error: (err) => {
        this.submittingAccess = false;
        this.accessError = err.error?.message || 'Failed to submit access request';
      },
    });
  }

  triggerToast(msg: string): void {
    this.toastMessage = msg;
    setTimeout(() => {
      this.toastMessage = '';
    }, 3000);
  }

  onDocDragStart(event: DragEvent, doc: IDocument): void {
    if (!this.isAdmin) return;
    this.draggedDoc = doc;
    event.dataTransfer?.setData('text/plain', doc.id);
  }

  onDocDragEnd(): void {
    this.draggedDoc = null;
    this.dragOverTargetFolder = null;
  }

  onFolderDragOver(event: DragEvent, folderPath: string): void {
    if (!this.isAdmin) return;
    event.preventDefault();
    this.dragOverTargetFolder = folderPath;
  }

  onFolderDragLeave(event: DragEvent, folderPath: string): void {
    if (this.dragOverTargetFolder === folderPath) {
      this.dragOverTargetFolder = null;
    }
  }

  onFolderDrop(event: DragEvent, targetFolder: string): void {
    event.preventDefault();
    this.dragOverTargetFolder = null;
    if (this.draggedDoc) {
      const doc = this.draggedDoc;
      this.draggedDoc = null;
      this.apiService.updateDocumentFolder(doc.id, targetFolder).subscribe({
        next: () => {
          this.triggerToast(`Moved "${doc.originalName}" to ${targetFolder || 'Root'}`);
          this.loadDocuments();
        },
        error: (err) => {
          this.uploadError = err.error?.message || 'Failed to move document';
        },
      });
    }
  }

  @HostListener('window:dragenter', ['$event'])
  onWindowDragEnter(event: DragEvent): void {
    if (!this.isAdmin) return;
    this.osDragCounter++;
    if (event.dataTransfer?.types.includes('Files')) {
      this.isOsDragOver = true;
    }
  }

  @HostListener('window:dragleave', ['$event'])
  onWindowDragLeave(event: DragEvent): void {
    if (!this.isAdmin) return;
    this.osDragCounter--;
    if (this.osDragCounter <= 0) {
      this.osDragCounter = 0;
      this.isOsDragOver = false;
    }
  }

  @HostListener('window:dragover', ['$event'])
  onWindowDragOver(event: DragEvent): void {
    if (!this.isAdmin) return;
    event.preventDefault();
  }

  @HostListener('window:drop', ['$event'])
  async onWindowDrop(event: DragEvent): Promise<void> {
    if (!this.isAdmin) return;
    event.preventDefault();
    this.osDragCounter = 0;
    this.isOsDragOver = false;

    if (event.dataTransfer) {
      const extracted = await extractDroppedFilesAndFolders(event.dataTransfer);
      for (const item of extracted) {
        const parts = item.relativePath.split('/');
        const relativeFolder = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
        const fullFolder = this.activeFolder ? (relativeFolder ? `${this.activeFolder}/${relativeFolder}` : this.activeFolder) : relativeFolder;
        this.apiService.uploadDocument(item.file, fullFolder || undefined).subscribe({
          next: () => {
            this.loadDocuments();
          },
        });
      }
      if (extracted.length > 0) {
        this.triggerToast(`Uploading ${extracted.length} dropped items...`);
      }
    }
  }
}
