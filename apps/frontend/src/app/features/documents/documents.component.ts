import { Component, OnInit, OnDestroy, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import {
  IDocument,
  DocumentStatus,
  ResourceType,
  IFolder,
  DocumentDownloadPolicy,
  FolderDownloadPolicy,
} from '@enter-chat/shared-types';
import { AuthService } from '../../core/services/auth.service';
import { ModalDialogService } from '../../core/services/modal-dialog.service';
import { extractDroppedFilesAndFolders } from '../../core/utils/drag-drop-folder.util';

@Component({
  selector: 'app-documents',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="relative p-4 sm:p-6 lg:p-8 w-full max-w-7xl mx-auto space-y-6 animate-fade-in text-zinc-900 dark:text-zinc-200">
      <!-- OS Drag & Drop Full Area Dashed Overlay Cue (Admin Only) -->
      @if (isOsDragOver && isAdmin) {
        <div class="fixed inset-0 z-50 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-8 pointer-events-none animate-fade-in">
          <div class="w-full max-w-2xl border-2 border-dashed border-zinc-400 dark:border-zinc-500 rounded-2xl p-12 text-center space-y-4 bg-white dark:bg-[#111114] shadow-2xl">
            <div class="w-14 h-14 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 flex items-center justify-center mx-auto border border-zinc-300 dark:border-zinc-700">
              <svg class="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <h2 class="text-lg font-semibold text-zinc-900 dark:text-white tracking-tight">Drop files or folders to upload</h2>
            <p class="text-xs text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
              {{ activeFolder ? 'Uploading into folder "' + activeFolder + '"' : 'Uploading to Root directory' }}
            </p>
          </div>
        </div>
      }

      <!-- Instant Top Notification Bar -->
      @if (toastMessage) {
        <div class="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-white dark:bg-[#18181b] border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white flex items-center gap-2.5 animate-fade-in shadow-lg">
          <div class="w-2 h-2 rounded-full bg-zinc-900 dark:bg-white"></div>
          <span class="text-xs font-medium tracking-wide text-zinc-800 dark:text-zinc-200">{{ toastMessage }}</span>
        </div>
      }

      <!-- Sheet / Tabular Preview Modal -->
      @if (selectedTabularDoc) {
        <div
          class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 md:p-8 lg:p-10 bg-black/50 dark:bg-black/80 backdrop-blur-sm animate-fade-in overflow-y-auto"
          (click)="closeTabularPreview()"
        >
          <div
            class="w-full max-w-5xl max-h-[80vh] bg-white dark:bg-[#111114] border border-zinc-200 dark:border-zinc-800 rounded-2xl flex flex-col overflow-hidden shadow-2xl my-auto"
            (click)="$event.stopPropagation()"
          >
            <!-- Modal Header -->
            <div class="flex items-center justify-between p-4 sm:p-5 border-b border-zinc-200 dark:border-zinc-800">
              <div class="flex items-center gap-3 truncate">
                <div class="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 flex-shrink-0">
                  <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div class="truncate">
                  <h3 class="text-sm font-semibold text-zinc-900 dark:text-white truncate">{{ selectedTabularDoc.originalName }}</h3>
                  <div class="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 font-mono">
                    <span>{{ selectedTabularDoc.totalRows || 0 }} rows</span>
                    <span>•</span>
                    <span>{{ selectedTabularDoc.sheetNames?.length || 1 }} sheet(s)</span>
                  </div>
                </div>
              </div>
              <button (click)="closeTabularPreview()" class="text-zinc-400 hover:text-zinc-900 dark:hover:text-white p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors" title="Close (Esc)">
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <!-- Sheet Tabs (if multi-sheet) -->
            @if (selectedTabularDoc.sheets && selectedTabularDoc.sheets.length > 1) {
              <div class="flex items-center gap-2 px-5 pt-3 border-b border-zinc-200 dark:border-zinc-800 overflow-x-auto bg-zinc-50 dark:bg-[#0a0a0d]">
                @for (sheet of selectedTabularDoc.sheets; track sheet.sheetName; let i = $index) {
                  <button
                    (click)="activeSheetIndex = i"
                    [ngClass]="activeSheetIndex === i ? 'text-zinc-900 dark:text-white border-b-2 border-zinc-900 dark:border-zinc-400 font-semibold' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'"
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
                  <div class="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Detected Schema Columns</div>
                  <div class="flex flex-wrap gap-1.5">
                    @for (col of currentActiveSheet.columns; track col.name) {
                      <span class="px-2.5 py-1 rounded-md bg-[#f0f1f3] dark:bg-[#18181b] border border-zinc-300 dark:border-zinc-800 text-xs text-zinc-800 dark:text-zinc-300 flex items-center gap-1.5">
                        <span class="font-medium text-zinc-800 dark:text-zinc-200">{{ col.name }}</span>
                        <span class="text-[10px] font-mono text-zinc-600 dark:text-zinc-400 bg-zinc-200 dark:bg-zinc-800 px-1 py-0.2 rounded border border-zinc-300 dark:border-zinc-700">{{ col.dtype }}</span>
                      </span>
                    }
                  </div>
                </div>

                <!-- Preview Table -->
                <div class="space-y-1.5">
                  <div class="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Sample Data Preview</div>
                  <div class="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-x-auto bg-white dark:bg-[#09090b]">
                    <table class="w-full min-w-[600px] text-left text-xs font-mono">
                      <thead class="bg-zinc-50 dark:bg-[#141417] text-zinc-600 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800">
                        <tr>
                          @for (col of currentActiveSheet.columns; track col.name) {
                            <th class="px-3 py-2.5 whitespace-nowrap text-zinc-700 dark:text-zinc-300 font-semibold">{{ col.name }}</th>
                          }
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800/70">
                        @for (row of currentActiveSheet.previewRows; track $index) {
                          <tr class="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors">
                            @for (col of currentActiveSheet.columns; track col.name) {
                              <td class="px-3 py-2 text-zinc-600 dark:text-zinc-400 whitespace-nowrap max-w-[200px] truncate">
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
            <div class="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
              <div class="flex items-center gap-2.5">
                <div class="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 flex items-center justify-center text-zinc-700 dark:text-zinc-300">
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <div>
                  <h3 class="text-sm font-semibold text-zinc-900 dark:text-white">Request File Access</h3>
                  <p class="text-xs text-zinc-500 dark:text-zinc-400 font-mono truncate max-w-xs">{{ targetAccessItem.name }}</p>
                </div>
              </div>
              <button (click)="closeAccessModal()" class="text-zinc-400 hover:text-zinc-900 dark:hover:text-white" title="Close (Esc)">
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div class="space-y-2">
              <label class="block text-xs font-medium text-zinc-700 dark:text-zinc-400">Business Justification / Reason *</label>
              <textarea
                [(ngModel)]="accessReason"
                rows="3"
                placeholder="Explain why you need access to this file..."
                class="w-full px-3 py-2 rounded-xl bg-[#f8f9fa] dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-500 placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
              ></textarea>
              @if (accessError) {
                <p class="text-[11px] text-zinc-300 font-mono">{{ accessError }}</p>
              }
            </div>

            <div class="flex items-center justify-end gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <button
                (click)="closeAccessModal()"
                class="px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                (click)="submitAccessRequest()"
                [disabled]="submittingAccess || !accessReason.trim()"
                class="px-4 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-black text-xs font-semibold transition-colors disabled:opacity-50 shadow-sm"
              >
                {{ submittingAccess ? 'Submitting...' : 'Submit Request' }}
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Move Document to Folder Modal (File-Manager Style) -->
      @if (showMoveModal && moveTargetDoc) {
        <div
          class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 bg-black/80 backdrop-blur-sm animate-fade-in"
          (click)="closeMoveModal()"
        >
          <div
            class="w-full max-w-lg bg-[#111114] border border-zinc-800 rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
            (click)="$event.stopPropagation()"
          >
            <!-- Header -->
            <div class="flex items-center justify-between p-4 sm:p-5 border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0">
              <div class="flex items-center gap-3 min-w-0">
                <div class="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 flex items-center justify-center text-zinc-700 dark:text-zinc-300 flex-shrink-0">
                  <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                </div>
                <div class="min-w-0">
                  <h3 class="text-sm font-semibold text-zinc-900 dark:text-white truncate" [title]="moveTargetDoc.originalName">
                    Move "{{ moveTargetDoc.originalName }}"
                  </h3>
                  <p class="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Select destination folder</p>
                </div>
              </div>
              <button
                (click)="closeMoveModal()"
                class="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                title="Close (Esc)"
              >
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <!-- Modal Body (Scrollable) -->
            <div class="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
              <!-- Breadcrumb Navigation Bar -->
              <div class="flex items-center gap-1.5 p-2 rounded-xl bg-zinc-50 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 text-xs overflow-x-auto">
                @if (moveModalCurrentNavPath) {
                  <button
                    type="button"
                    (click)="navigateMoveFolderUp()"
                    class="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex-shrink-0"
                    title="Go to parent folder"
                  >
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                  </button>
                }

                <div class="flex items-center gap-1 min-w-0 flex-wrap">
                  @for (crumb of moveBreadcrumbSegments; track crumb.path; let last = $last) {
                    @if (!$first) {
                      <span class="text-zinc-600 font-mono">/</span>
                    }
                    <button
                      type="button"
                      (click)="navigateMoveFolder(crumb.path)"
                      class="px-2 py-1 rounded-lg transition-colors font-mono truncate max-w-[120px]"
                      [ngClass]="last ? 'bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-white font-semibold' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60'"
                    >
                      {{ crumb.label }}
                    </button>
                  }
                </div>
              </div>

              <!-- Folder Navigation & Destination List -->
              <div class="space-y-1.5">
                <!-- Option to Select Current Directory itself -->
                <div
                  (click)="selectMoveDestination(moveModalCurrentNavPath)"
                  class="flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all duration-150 min-h-[44px]"
                  [ngClass]="moveSelectedDestination === moveModalCurrentNavPath ? 'bg-red-50 dark:bg-red-950/30 border-red-400 dark:border-red-500/50 text-red-900 dark:text-white' : 'bg-zinc-50 dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800/40 text-zinc-800 dark:text-zinc-300'"
                >
                  <div class="flex items-center gap-2.5 min-w-0">
                    <span
                      class="w-5 h-5 rounded-full flex items-center justify-center border text-[10px]"
                      [ngClass]="moveSelectedDestination === moveModalCurrentNavPath ? 'border-red-500 bg-red-500 text-white' : 'border-zinc-600 text-transparent'"
                    >
                      ✓
                    </span>
                    <span class="text-xs font-semibold truncate">
                      {{ moveModalCurrentNavPath ? '📁 Place in: ' + moveModalCurrentNavPath : '📁 All Files (Root Directory)' }}
                    </span>
                  </div>
                  <span class="text-[11px] text-zinc-500 font-mono flex-shrink-0">
                    {{ moveSelectedDestination === moveModalCurrentNavPath ? 'Selected' : 'Choose current folder' }}
                  </span>
                </div>

                <!-- Subfolders List -->
                @let subfolders = getMoveSubfolders(moveModalCurrentNavPath);
                @if (subfolders.length > 0) {
                  <div class="space-y-1 pt-1 max-h-[260px] overflow-y-auto pr-1">
                    @for (sub of subfolders; track sub.fullPath) {
                      <div
                        (click)="selectMoveDestination(sub.fullPath)"
                        class="group flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all duration-150 min-h-[44px]"
                        [ngClass]="moveSelectedDestination === sub.fullPath ? 'bg-red-50 dark:bg-red-950/30 border-red-400 dark:border-red-500/50 text-red-900 dark:text-white' : 'bg-white dark:bg-[#111114] border-zinc-200 dark:border-zinc-800/80 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 hover:border-zinc-300 dark:hover:border-zinc-700 text-zinc-800 dark:text-zinc-300'"
                      >
                        <!-- Left: Folder icon and name -->
                        <div class="flex items-center gap-2.5 min-w-0 flex-1">
                          <span
                            class="w-5 h-5 rounded-full flex items-center justify-center border text-[10px] flex-shrink-0"
                            [ngClass]="moveSelectedDestination === sub.fullPath ? 'border-red-500 bg-red-500 text-white' : 'border-zinc-700 text-transparent group-hover:border-zinc-500'"
                          >
                            ✓
                          </span>
                          <span class="text-base flex-shrink-0">📁</span>
                          <span class="text-xs font-medium text-zinc-900 dark:text-zinc-200 group-hover:text-black dark:group-hover:text-white truncate" [title]="sub.name">
                            {{ sub.name }}
                          </span>
                        </div>

                        <!-- Right: Subfolder count badge & drill-down action -->
                        <div class="flex items-center gap-2 flex-shrink-0">
                          @if (sub.subfolderCount > 0) {
                            <span class="text-[10px] text-zinc-500 font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                              {{ sub.subfolderCount }} sub
                            </span>
                          }
                          <button
                            type="button"
                            (click)="$event.stopPropagation(); navigateMoveFolder(sub.fullPath)"
                            class="p-1.5 rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-transparent hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors flex items-center gap-1 text-xs"
                            title="Open subfolder"
                          >
                            <span>Open</span>
                            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    }
                  </div>
                } @else {
                  <div class="p-6 text-center text-xs text-zinc-500 border border-dashed border-zinc-300 dark:border-zinc-800 rounded-xl">
                    No subfolders in this directory
                  </div>
                }
              </div>

              <!-- Location & Selection Feedback -->
              <div class="p-3 rounded-xl bg-zinc-50 dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 text-xs space-y-1.5">
                <div class="flex items-center justify-between text-zinc-400">
                  <span>Current location:</span>
                  <span class="text-zinc-800 dark:text-zinc-200 font-mono">{{ moveTargetDoc.folder ? moveTargetDoc.folder : 'All Files (Root)' }}</span>
                </div>

                @if (moveSelectedDestination !== null) {
                  <div class="flex items-center justify-between text-zinc-400 pt-1 border-t border-zinc-800/80">
                    <span>Target destination:</span>
                    <span class="text-white font-mono font-semibold">{{ moveSelectedDestination ? moveSelectedDestination : 'All Files (Root)' }}</span>
                  </div>
                }

                @if (isDestinationCurrentLocation()) {
                  <div class="text-[11px] text-amber-400 flex items-center gap-1.5 pt-1">
                    <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>File is already in this folder.</span>
                  </div>
                }

                @if (moveErrorMessage) {
                  <div class="text-[11px] text-red-400 pt-1">
                    {{ moveErrorMessage }}
                  </div>
                }
              </div>
            </div>

            <!-- Footer -->
            <div class="p-4 sm:p-5 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-end gap-2.5 flex-shrink-0 bg-white dark:bg-[#111114]">
              <button
                type="button"
                (click)="closeMoveModal()"
                [disabled]="isMovingFile"
                class="px-4 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-300 text-xs font-medium transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                (click)="executeMove()"
                [disabled]="isMovingFile || moveSelectedDestination === null || isDestinationCurrentLocation()"
                class="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-400 active:bg-red-600 text-white text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm"
              >
                @if (isMovingFile) {
                  <svg class="w-3.5 h-3.5 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Moving file...</span>
                } @else {
                  <span>Move Here</span>
                }
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Admin File Download Policy Modal -->
      <!-- Document Download Policy Tiny Contextual Popover (Fixed Viewport-Aware) -->
      @if (editingDownloadPolicyDoc && isAdmin) {
        <div
          class="fixed z-50 w-64 bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 rounded-xl p-1.5 shadow-xl dark:shadow-2xl dark:shadow-black/80 animate-fade-in text-xs select-none"
          [style.top.px]="downloadPolicyMenuPosition.top"
          [style.left.px]="downloadPolicyMenuPosition.left"
          [style.right.px]="downloadPolicyMenuPosition.right"
          (click)="$event.stopPropagation()"
          role="menu"
          aria-orientation="vertical"
        >
          <div class="px-2.5 py-1.5 border-b border-zinc-200 dark:border-zinc-800/80 mb-1">
            <div class="text-[11px] font-semibold text-zinc-800 dark:text-zinc-300">Download Setting</div>
            <div class="text-[10px] text-zinc-500 font-mono truncate" [title]="editingDownloadPolicyDoc.originalName">
              {{ editingDownloadPolicyDoc.originalName }}
            </div>
          </div>

          <!-- Option 1: Use folder setting -->
          <button
            type="button"
            (click)="setDocDownloadPolicy('inherit')"
            class="w-full flex items-start justify-between gap-2 px-2.5 py-2 rounded-lg text-left transition-colors"
            [ngClass]="selectedDocDownloadPolicy === 'inherit' ? 'bg-zinc-100 text-zinc-900 font-semibold dark:bg-zinc-800 dark:text-white' : 'text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-50 dark:hover:bg-zinc-800/70'"
            role="menuitem"
          >
            <div>
              <div class="font-medium">Use folder setting</div>
              <div class="text-[10px] text-zinc-400 mt-0.5">Follow folder's download setting</div>
            </div>
            @if (selectedDocDownloadPolicy === 'inherit') {
              <svg class="w-4 h-4 text-white flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
            }
          </button>

          <!-- Option 2: Allow downloads -->
          <button
            type="button"
            (click)="setDocDownloadPolicy('allowed')"
            class="w-full flex items-start justify-between gap-2 px-2.5 py-2 rounded-lg text-left transition-colors"
            [ngClass]="selectedDocDownloadPolicy === 'allowed' ? 'bg-zinc-100 text-zinc-900 font-semibold dark:bg-zinc-800 dark:text-white' : 'text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-50 dark:hover:bg-zinc-800/70'"
            role="menuitem"
          >
            <div>
              <div class="font-medium">Allow downloads</div>
              <div class="text-[10px] text-zinc-400 mt-0.5">People who can access can download</div>
            </div>
            @if (selectedDocDownloadPolicy === 'allowed') {
              <svg class="w-4 h-4 text-white flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
            }
          </button>

          <!-- Option 3: Don't allow downloads -->
          <button
            type="button"
            (click)="setDocDownloadPolicy('restricted')"
            class="w-full flex items-start justify-between gap-2 px-2.5 py-2 rounded-lg text-left transition-colors"
            [ngClass]="selectedDocDownloadPolicy === 'restricted' ? 'bg-red-50 text-red-700 font-semibold dark:bg-zinc-800 dark:text-red-300' : 'text-zinc-700 dark:text-zinc-300 hover:text-red-600 dark:hover:text-red-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/70'"
            role="menuitem"
          >
            <div>
              <div class="font-medium text-red-400">Don't allow downloads</div>
              <div class="text-[10px] text-zinc-400 mt-0.5">People can access, but cannot download</div>
            </div>
            @if (selectedDocDownloadPolicy === 'restricted') {
              <svg class="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
            }
          </button>
        </div>
      }

      <!-- Upload File Modal (Admin with Downloads Choice) -->
      @if (showUploadModal && pendingUploadFile && isAdmin) {
        <div
          class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
          (click)="closeUploadModal()"
        >
          <div
            class="w-full max-w-md bg-[#111114] border border-zinc-800 rounded-2xl p-6 space-y-5 shadow-2xl"
            (click)="$event.stopPropagation()"
          >
            <div class="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
              <h3 class="text-sm font-semibold text-zinc-900 dark:text-white">Upload File</h3>
              <button
                (click)="closeUploadModal()"
                class="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div class="space-y-2 text-xs">
              <div class="flex items-center justify-between text-zinc-400">
                <span>File:</span>
                <span class="text-zinc-800 dark:text-zinc-200 font-mono truncate max-w-[220px]" [title]="pendingUploadFile.name">{{ pendingUploadFile.name }}</span>
              </div>
              <div class="flex items-center justify-between text-zinc-400">
                <span>Folder:</span>
                <span class="text-zinc-800 dark:text-zinc-200 font-medium">{{ activeFolder || 'All Files (Root)' }}</span>
              </div>
            </div>

            <div class="space-y-2.5">
              <label class="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider block">Downloads</label>

              <label
                (click)="uploadDownloadPolicy = 'inherit'"
                class="flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-colors"
                [ngClass]="uploadDownloadPolicy === 'inherit' ? 'bg-zinc-100 dark:bg-zinc-800/90 border-zinc-400 dark:border-zinc-500' : 'bg-zinc-50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800/40'"
              >
                <input
                  type="radio"
                  name="uploadPolicyOption"
                  value="inherit"
                  [checked]="uploadDownloadPolicy === 'inherit'"
                  class="mt-0.5 accent-white"
                />
                <div>
                  <div class="text-xs font-semibold text-zinc-900 dark:text-white">Use folder setting</div>
                  <div class="text-[11px] text-zinc-400 mt-0.5">
                    Follow the folder's download setting.
                  </div>
                </div>
              </label>

              <label
                (click)="uploadDownloadPolicy = 'allowed'"
                class="flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-colors"
                [ngClass]="uploadDownloadPolicy === 'allowed' ? 'bg-zinc-100 dark:bg-zinc-800/90 border-zinc-400 dark:border-zinc-500' : 'bg-zinc-50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800/40'"
              >
                <input
                  type="radio"
                  name="uploadPolicyOption"
                  value="allowed"
                  [checked]="uploadDownloadPolicy === 'allowed'"
                  class="mt-0.5 accent-white"
                />
                <div>
                  <div class="text-xs font-semibold text-zinc-900 dark:text-white">Allow downloads</div>
                  <div class="text-[11px] text-zinc-400 mt-0.5">
                    People who can access this file can download it.
                  </div>
                </div>
              </label>

              <label
                (click)="uploadDownloadPolicy = 'restricted'"
                class="flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-colors"
                [ngClass]="uploadDownloadPolicy === 'restricted' ? 'bg-zinc-100 dark:bg-zinc-800/90 border-zinc-400 dark:border-zinc-500' : 'bg-zinc-50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800/40'"
              >
                <input
                  type="radio"
                  name="uploadPolicyOption"
                  value="restricted"
                  [checked]="uploadDownloadPolicy === 'restricted'"
                  class="mt-0.5 accent-white"
                />
                <div>
                  <div class="text-xs font-semibold text-zinc-900 dark:text-white">Don't allow downloads</div>
                  <div class="text-[11px] text-zinc-400 mt-0.5">
                    People can access this file, but cannot download it.
                  </div>
                </div>
              </label>
            </div>

            <div class="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                (click)="closeUploadModal()"
                class="px-4 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-300 text-xs font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                (click)="confirmUpload()"
                class="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-black text-xs font-semibold transition-colors shadow-sm"
              >
                Upload
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Contextual Action Menu Popup (Fixed Viewport-Aware) -->
      @if (activeActionMenuDoc) {
        <div
          class="fixed z-50 min-w-[190px] w-48 bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 rounded-xl p-1.5 shadow-xl dark:shadow-2xl dark:shadow-black/80 animate-fade-in text-xs select-none"
          [style.top.px]="menuPosition.top"
          [style.left.px]="menuPosition.left"
          [style.right.px]="menuPosition.right"
          (click)="$event.stopPropagation()"
          role="menu"
          aria-orientation="vertical"
        >
          <!-- Preview (Tabular spreadsheets) -->
          @if (isTabular(activeActionMenuDoc) && activeActionMenuDoc.sheets && activeActionMenuDoc.sheets.length > 0) {
            <button
              type="button"
              (click)="handleMenuPreview(activeActionMenuDoc)"
              class="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-colors text-left"
              role="menuitem"
            >
              <svg class="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <span>Preview</span>
            </button>
          }

          <!-- Download -->
          @if (canDownloadDoc(activeActionMenuDoc)) {
            <button
              type="button"
              (click)="handleMenuDownload(activeActionMenuDoc)"
              class="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-colors text-left"
              role="menuitem"
            >
              <svg class="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>Download</span>
            </button>
          } @else {
            <div
              class="w-full flex items-center justify-between px-3 py-2 rounded-lg text-zinc-500 cursor-not-allowed select-none"
              title="This file can't be downloaded"
              role="menuitem"
              aria-disabled="true"
            >
              <div class="flex items-center gap-2.5">
                <svg class="w-4 h-4 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>Download</span>
              </div>
              <span class="text-[10px] text-zinc-500 font-normal">Not available</span>
            </div>
          }

          <!-- Admin Actions: Replace, Move -->
          @if (isAdmin) {
            <button
              type="button"
              (click)="handleMenuReplace(activeActionMenuDoc, replaceFileInput)"
              class="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-colors text-left"
              role="menuitem"
            >
              <svg class="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Replace</span>
            </button>

            <button
              type="button"
              (click)="handleMenuMove(activeActionMenuDoc)"
              class="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-colors text-left"
              role="menuitem"
            >
              <svg class="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              <span>Move</span>
            </button>

            <div class="my-1 border-t border-zinc-200 dark:border-zinc-800"></div>

            <!-- Delete (Destructive) -->
            <button
              type="button"
              (click)="handleMenuDelete(activeActionMenuDoc.id)"
              class="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors text-left group"
              role="menuitem"
            >
              <svg class="w-4 h-4 text-red-400 group-hover:text-red-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              <span>Delete</span>
            </button>
          }
        </div>
      }

      <!-- Page Header -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800/80 pb-6">
        <div>
          <div class="flex items-center gap-3">
            <h1 class="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">Files</h1>
            <span class="px-2.5 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 text-xs font-mono text-zinc-700 dark:text-zinc-400">
              {{ documents.length }} items
            </span>
          </div>
          <p class="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-1 max-w-2xl">
            Unified repository for enterprise documents, policies, datasets, and spreadsheets.
          </p>
        </div>
        <div class="flex items-center gap-2.5 flex-wrap">
          @if (isAdmin) {
            @if (activeFolder) {
              <!-- Folder Download Policy Toggle (Admin) -->
              <div class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 text-xs">
                <span class="text-zinc-400">Downloads:</span>
                <button
                  type="button"
                  (click)="toggleActiveFolderDownloadPolicy()"
                  class="flex items-center gap-1.5 font-medium px-2.5 py-1 rounded-lg transition-colors text-xs"
                  [ngClass]="activeFolderDownloadPolicy === 'restricted' ? 'bg-red-100 dark:bg-red-950/40 hover:bg-red-200 dark:hover:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-500/40' : 'bg-white dark:bg-[#18181b] hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 hover:text-black dark:hover:text-white border border-zinc-300 dark:border-zinc-700/80'"
                  [title]="'Click to toggle folder download policy (currently ' + activeFolderDownloadPolicy + ')'"
                >
                  @if (activeFolderDownloadPolicy === 'restricted') {
                    <svg class="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <span>Not allowed</span>
                  } @else {
                    <svg class="w-3.5 h-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                    </svg>
                    <span>Allowed</span>
                  }
                </button>
              </div>

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
              <span>New Folder</span>
            </button>
    
            <label class="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-black font-semibold text-xs transition-colors cursor-pointer inline-flex items-center gap-2 shadow-sm">
              <svg class="w-4 h-4 text-white dark:text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
        <div class="p-5 rounded-2xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-zinc-800 space-y-4 animate-fade-in shadow-sm dark:shadow-none">
          <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div class="flex items-center gap-2 flex-1">
              <svg class="w-5 h-5 text-zinc-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              @if (activeFolder) {
                <span class="text-xs text-zinc-600 dark:text-zinc-400 font-mono bg-zinc-100 dark:bg-[#09090b] px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800">
                  {{ activeFolder }}/
                </span>
              }
              <input
                type="text"
                [(ngModel)]="newFolderName"
                (keydown.enter)="createFolder()"
                [placeholder]="activeFolder ? 'Enter subfolder name (e.g. Reports)...' : 'Enter folder name (e.g. Policies, Finance)...'"
                class="flex-1 px-3 py-2 rounded-xl bg-[#f8f9fa] dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 text-xs sm:text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-500 placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
              />
            </div>
            <div class="flex items-center gap-2">
              <button
                (click)="createFolder()"
                [disabled]="!newFolderName.trim()"
                class="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-black text-xs font-semibold disabled:opacity-50 transition-colors shadow-sm"
              >
                Create Folder
              </button>
              <button
                (click)="showNewFolderInput = false; newFolderName = ''; newFolderDepartments = []"
                class="px-3 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-400 text-xs font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>

          <!-- Department Multi-Select Chips -->
          <div class="pt-3 border-t border-zinc-200 dark:border-zinc-800/80 space-y-2">
            <div class="flex items-center justify-between">
              <label class="text-xs font-medium text-zinc-800 dark:text-zinc-300 flex items-center gap-1.5">
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
                  [ngClass]="newFolderDepartments.includes(dept) ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-200 dark:text-black font-semibold dark:border-zinc-200' : 'bg-zinc-100 text-zinc-700 border-zinc-200 hover:text-zinc-900 hover:border-zinc-300 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-800 dark:hover:text-white dark:hover:border-zinc-700'"
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
      <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-[#111114] p-2.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm dark:shadow-none">
        <!-- Breadcrumbs Trail -->
        <div class="flex items-center gap-1.5 text-xs text-zinc-400 overflow-x-auto px-1 py-0.5">
          <button
            (click)="setActiveFolder(null)"
            (dragover)="onFolderDragOver($event, '')"
            (dragleave)="onFolderDragLeave($event, '')"
            (drop)="onFolderDrop($event, '')"
            [ngClass]="activeFolder === null ? 'text-zinc-900 font-semibold bg-white border-zinc-300 shadow-sm dark:text-black dark:bg-white dark:border-transparent' : (dragOverTargetFolder === '' ? 'border-zinc-400 dark:border-zinc-500 bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-white' : 'text-zinc-600 hover:text-zinc-900 bg-zinc-100 border-zinc-200 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:text-white dark:bg-zinc-900 dark:border-zinc-800 dark:hover:bg-zinc-800')"
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
              [ngClass]="activeFolder === segment.path ? 'text-zinc-900 dark:text-white font-semibold bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700' : 'text-zinc-600 hover:text-zinc-900 bg-zinc-100 border-zinc-200 dark:text-zinc-400 dark:hover:text-white dark:bg-zinc-900 dark:border-zinc-800'"
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
              class="w-full sm:w-auto px-3 py-1.5 rounded-xl bg-[#f8f9fa] dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-800 dark:text-zinc-300 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-600 transition-colors cursor-pointer min-h-[36px]"
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
              class="w-full pl-8 pr-7 py-1.5 rounded-xl bg-[#f8f9fa] dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-600 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 transition-colors min-h-[36px]"
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
          <div class="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 px-1">
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
                [ngClass]="dragOverTargetFolder === sub.fullPath ? 'border-zinc-400 dark:border-zinc-500 bg-zinc-100 dark:bg-zinc-800' : 'border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-[#111114] hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-[#161619]'"
                class="group p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between"
              >
                <div class="flex items-center gap-2.5 truncate">
                  <div class="w-7 h-7 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-zinc-600 dark:text-zinc-400 flex-shrink-0">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                  </div>
                  <div class="truncate">
                    <div class="text-xs font-medium text-zinc-900 dark:text-zinc-200 truncate group-hover:text-black dark:group-hover:text-white">{{ sub.name }}</div>
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
      <div class="bg-white dark:bg-[#111114] border border-zinc-200 dark:border-zinc-800/80 rounded-2xl overflow-hidden shadow-sm dark:shadow-none">
        @if (loading) {
          <div class="p-16 text-center text-zinc-500 text-sm flex flex-col items-center justify-center gap-3">
            <div class="w-5 h-5 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin"></div>
            <span>Loading files & documents...</span>
          </div>
        } @else if (filteredDocuments.length === 0) {
          <div class="p-16 text-center space-y-3">
            <div class="w-12 h-12 rounded-xl bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 flex items-center justify-center mx-auto">
              <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 class="text-sm font-semibold text-zinc-900 dark:text-white">No files found</h3>
            <p class="text-xs text-zinc-500 max-w-sm mx-auto">
              {{ searchQuery ? 'No files match your search query.' : (isAdmin ? 'Upload or drag and drop PDFs, spreadsheets, Word docs, or CSVs directly here.' : 'No files have been made available in this folder yet.') }}
            </p>
          </div>
        } @else {
          <!-- Desktop Documents Table (>= 768px) -->
          <div class="hidden md:block overflow-x-auto w-full">
            <table class="w-full text-left text-xs">
              <thead class="bg-zinc-50 dark:bg-[#09090b] text-zinc-600 dark:text-zinc-400 text-[11px] font-semibold uppercase tracking-wider border-b border-zinc-200 dark:border-zinc-800">
                <tr>
                  <th class="px-4 py-3 min-w-[150px]">File Name</th>
                  <th class="px-3 py-3 min-w-[80px]">Folder</th>
                  <th class="px-2 py-3 text-center w-14">Format</th>
                  <th class="px-3 py-3 min-w-[80px]">Status</th>
                  <th class="px-3 py-3 text-center min-w-[100px]">Download</th>
                  <th class="px-3 py-3 font-mono min-w-[80px]">Chunks / Rows</th>
                  <th class="px-3 py-3 font-mono min-w-[65px]">Size</th>
                  <th class="px-3 py-3 min-w-[85px]">Uploaded</th>
                  <th class="px-3 py-3 text-right w-12 min-w-[48px] sticky right-0 bg-zinc-50 dark:bg-[#09090b] z-10">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800/60">
                @for (doc of filteredDocuments; track doc.id) {
                  <tr
                    [draggable]="isAdmin"
                    (dragstart)="onDocDragStart($event, doc)"
                    (dragend)="onDocDragEnd()"
                    class="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors cursor-pointer group"
                    [ngClass]="[
                      isAdmin ? 'active:cursor-grabbing select-none' : '',
                      !canAccessDoc(doc) ? 'opacity-60 bg-black/20' : ''
                    ]"
                    (click)="onRowClick(doc)"
                  >
                    <!-- File Name with Icon -->
                    <td class="px-4 py-2.5">
                      <div class="flex items-center gap-2.5">
                        @if (!canAccessDoc(doc)) {
                          <span class="p-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-500" title="Access Locked">
                            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                          </span>
                        } @else {
                          <div class="w-6 h-6 rounded bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/70 flex items-center justify-center text-zinc-600 dark:text-zinc-400 flex-shrink-0">
                            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </div>
                        }
                        <div class="font-medium text-zinc-900 dark:text-zinc-200 truncate max-w-[170px] md:max-w-[200px] lg:max-w-xs xl:max-w-md group-hover:text-black dark:group-hover:text-white transition-colors" [title]="doc.originalName">
                          {{ doc.originalName }}
                        </div>
                      </div>
                    </td>

                    <!-- Folder Pill -->
                    <td class="px-3 py-2.5">
                      <span class="inline-flex items-center gap-1 text-[11px] text-zinc-600 dark:text-zinc-400 font-mono bg-zinc-100 dark:bg-zinc-900 px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-800">
                        <span class="truncate max-w-[110px]">{{ doc.folder ? doc.folder : 'Root' }}</span>
                      </span>
                    </td>

                    <!-- Format Badge -->
                    <td class="px-2 py-2.5 text-center">
                      <span class="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 font-medium">
                        {{ doc.fileType }}
                      </span>
                    </td>

                    <!-- Status -->
                    <td class="px-3 py-2.5">
                      @if (doc.status === DocumentStatus.READY) {
                        <span class="inline-flex items-center gap-2 text-xs font-mono text-zinc-700 dark:text-zinc-300">
                          <span class="w-2 h-2 rounded-full bg-zinc-800 dark:bg-zinc-200"></span>
                          <span>Indexed</span>
                        </span>
                      } @else if (doc.status === DocumentStatus.PROCESSING) {
                        <span class="inline-flex items-center gap-2 text-xs font-mono text-zinc-400">
                          <span class="w-2 h-2 rounded-full bg-zinc-400 animate-pulse"></span>
                          <span>Indexing...</span>
                        </span>
                      } @else {
                        <div class="inline-flex items-center gap-2">
                          <span class="inline-flex items-center gap-1.5 text-xs font-mono text-red-400">
                            <span class="w-2 h-2 rounded-full bg-red-400"></span>
                            <span>Failed</span>
                          </span>
                          <button
                            *ngIf="isAdmin"
                            (click)="$event.stopPropagation(); retryDoc(doc.id)"
                            class="px-2 py-0.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-white text-[10px] border border-zinc-700 transition-colors"
                            title="Retry ingestion"
                          >
                            Retry
                          </button>
                        </div>
                      }
                    </td>

                    <!-- Download Permission Button -->
                    <td class="px-3 py-2.5 text-center" (click)="$event.stopPropagation()">
                      @if (doc.effectiveDownloadPolicy === 'restricted') {
                        <button
                          type="button"
                          (click)="isAdmin ? openDownloadPolicyModal(doc, $event) : null"
                          [class.cursor-pointer]="isAdmin"
                          [class.cursor-default]="!isAdmin"
                          class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-950/60 text-red-700 hover:text-red-800 dark:text-red-300 dark:hover:text-red-200 border border-red-200 hover:border-red-300 dark:border-red-500/40 dark:hover:border-red-500/60 text-xs font-medium transition-all shadow-sm group/perm"
                          [title]="isAdmin ? 'Click to change download setting' : 'Downloads: Not allowed'"
                        >
                          <svg class="w-3.5 h-3.5 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                          <span>Not allowed</span>
                          @if (doc.downloadPolicy === 'inherit') {
                            <span class="text-[10px] text-zinc-500 font-normal">Folder setting</span>
                          }
                          @if (isAdmin) {
                            <svg class="w-3 h-3 text-red-400/60 group-hover/perm:text-red-300 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                            </svg>
                          }
                        </button>
                      } @else {
                        <button
                          type="button"
                          (click)="isAdmin ? openDownloadPolicyModal(doc, $event) : null"
                          [class.cursor-pointer]="isAdmin"
                          [class.cursor-default]="!isAdmin"
                          class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-[#18181b] dark:hover:bg-zinc-800 text-zinc-800 hover:text-black dark:text-zinc-200 dark:hover:text-white border border-zinc-300 hover:border-zinc-400 dark:border-zinc-700/80 dark:hover:border-zinc-500 text-xs font-medium transition-all shadow-sm group/perm"
                          [title]="isAdmin ? 'Click to change download setting' : 'Downloads: Allowed'"
                        >
                          <svg class="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                          </svg>
                          <span>Allowed</span>
                          @if (doc.downloadPolicy === 'inherit') {
                            <span class="text-[10px] text-zinc-500 font-normal">Folder setting</span>
                          }
                          @if (isAdmin) {
                            <svg class="w-3 h-3 text-zinc-400 group-hover/perm:text-zinc-200 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                            </svg>
                          }
                        </button>
                      }
                    </td>

                    <!-- Chunks / Rows -->
                    <td class="px-3 py-2.5 font-mono text-zinc-600 dark:text-zinc-400">
                      @if (isTabular(doc)) {
                        <span>{{ doc.totalRows || 0 }} rows</span>
                      } @else {
                        <span>{{ doc.chunkCount || 0 }} chunks</span>
                      }
                    </td>

                    <!-- File Size -->
                    <td class="px-3 py-2.5 font-mono text-zinc-600 dark:text-zinc-400">
                      {{ (doc.fileSize / 1024).toFixed(1) }} KB
                    </td>

                    <!-- Upload Date -->
                    <td class="px-3 py-2.5 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                      {{ doc.createdAt | date:'mediumDate' }}
                    </td>

                    <!-- Actions -->
                    <td class="px-3 py-2.5 text-right whitespace-nowrap sticky right-0 bg-white group-hover:bg-zinc-50 dark:bg-[#111114] dark:group-hover:bg-[#18181b] transition-colors z-10" (click)="$event.stopPropagation()">
                      @if (canAccessDoc(doc)) {
                        <button
                          type="button"
                          (click)="toggleActionMenu(doc, $event)"
                          class="w-8 h-8 rounded-lg text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-600 focus:bg-zinc-100 dark:focus:bg-zinc-800 ml-auto"
                          [attr.aria-expanded]="activeActionMenuDoc?.id === doc.id"
                          [attr.aria-label]="'More actions for ' + doc.originalName"
                          title="More actions"
                        >
                          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <circle cx="12" cy="5" r="1.75" />
                            <circle cx="12" cy="12" r="1.75" />
                            <circle cx="12" cy="19" r="1.75" />
                          </svg>
                        </button>
                      } @else {
                        @if (doc.requestStatus === 'pending') {
                          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-400 font-mono">
                            Pending
                          </span>
                        } @else {
                          <button
                            (click)="openAccessModal(doc)"
                            class="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-black rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5 shadow-sm"
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
          <div class="block md:hidden divide-y divide-zinc-200 dark:divide-zinc-800/80">
            @for (doc of filteredDocuments; track doc.id) {
              <div
                class="p-4 space-y-3 transition-colors"
                [ngClass]="!canAccessDoc(doc) ? 'opacity-60 bg-zinc-100 dark:bg-black/20' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/20'"
                (click)="onRowClick(doc)"
              >
                <!-- Header: Icon, Name, Format -->
                <div class="flex items-start justify-between gap-2.5">
                  <div class="flex items-center gap-2.5 min-w-0">
                    <div class="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/70 flex items-center justify-center text-zinc-700 dark:text-zinc-300 flex-shrink-0">
                      @if (!canAccessDoc(doc)) {
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
                      <div class="font-medium text-zinc-900 dark:text-white text-sm truncate" [title]="doc.originalName">
                        {{ doc.originalName }}
                      </div>
                      <div class="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400 font-mono mt-0.5">
                        <span>📁 {{ doc.folder ? doc.folder : 'Root' }}</span>
                        <span>•</span>
                        <span>{{ (doc.fileSize / 1024).toFixed(1) }} KB</span>
                      </div>
                    </div>
                  </div>

                  <div class="flex items-center gap-1.5 flex-shrink-0">
                    <span class="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 font-medium">
                      {{ doc.fileType }}
                    </span>
                    @if (canAccessDoc(doc)) {
                      <button
                        type="button"
                        (click)="toggleActionMenu(doc, $event)"
                        class="w-11 h-11 min-w-[44px] min-h-[44px] -mr-2 -my-2 rounded-lg text-zinc-400 hover:text-white active:bg-zinc-800 flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-600"
                        [attr.aria-expanded]="activeActionMenuDoc?.id === doc.id"
                        [attr.aria-label]="'More actions for ' + doc.originalName"
                        title="More actions"
                      >
                        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <circle cx="12" cy="5" r="1.75" />
                          <circle cx="12" cy="12" r="1.75" />
                          <circle cx="12" cy="19" r="1.75" />
                        </svg>
                      </button>
                    }
                  </div>
                </div>

                <!-- Status & Chunks/Rows Row -->
                <div class="flex items-center justify-between text-xs font-mono pt-1">
                  <div>
                    @if (doc.status === DocumentStatus.READY) {
                      <span class="inline-flex items-center gap-1.5 text-[11px] text-zinc-700 dark:text-zinc-300">
                        <span class="w-1.5 h-1.5 rounded-full bg-zinc-800 dark:bg-zinc-200"></span>
                        Indexed
                      </span>
                    } @else if (doc.status === DocumentStatus.PROCESSING) {
                      <span class="inline-flex items-center gap-1.5 text-[11px] text-zinc-400">
                        <span class="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-pulse"></span>
                        Indexing...
                      </span>
                    } @else {
                      <span class="inline-flex items-center gap-1.5 text-[11px] text-red-400">
                        <span class="w-1.5 h-1.5 rounded-full bg-red-400"></span>
                        Failed
                      </span>
                    }
                  </div>

                  <!-- Download Status -->
                  <div>
                    @if (doc.effectiveDownloadPolicy === 'restricted') {
                      <span class="inline-flex items-center gap-1 text-[10px] font-mono text-red-400">
                        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                        Not allowed
                      </span>
                    } @else {
                      <span class="inline-flex items-center gap-1 text-[10px] font-mono text-zinc-700 dark:text-zinc-300">
                        <svg class="w-3 h-3 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                        </svg>
                        Allowed
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

                <!-- Access Request for Inaccessible Documents on Mobile -->
                @if (!canAccessDoc(doc)) {
                  <div class="pt-2 border-t border-zinc-800/80 flex items-center gap-2" (click)="$event.stopPropagation()">
                    @if (doc.requestStatus === 'pending') {
                      <span class="w-full text-center py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-400 font-mono">
                        Access Request Pending
                      </span>
                    } @else {
                      <button
                        (click)="openAccessModal(doc)"
                        class="w-full min-h-[44px] px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-black rounded-xl text-xs font-semibold flex items-center justify-center gap-2 shadow-sm"
                      >
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                        <span>Request Access</span>
                      </button>
                    }
                  </div>
                }
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
  moveModalCurrentNavPath = '';
  moveSelectedDestination: string | null = null;
  isMovingFile = false;
  moveErrorMessage: string | null = null;

  showAccessModal = false;
  targetAccessItem: { id: string; name: string; type: ResourceType } | null = null;
  accessReason = '';
  submittingAccess = false;
  accessError = '';

  selectedTabularDoc: IDocument | null = null;
  activeSheetIndex = 0;

  // Folder & Document Download Policy Management
  folderList: IFolder[] = [];
  editingDownloadPolicyDoc: IDocument | null = null;
  selectedDocDownloadPolicy: DocumentDownloadPolicy = 'inherit';
  isSavingDocDownloadPolicy = false;

  // Upload with Download Settings (Admin)
  showUploadModal = false;
  pendingUploadFile: File | null = null;
  uploadDownloadPolicy: DocumentDownloadPolicy = 'inherit';

  // Contextual Document Actions Menu
  activeActionMenuDoc: IDocument | null = null;
  menuPosition: { top: number; left?: number; right?: number } = { top: 0 };

  // Contextual Download Policy Popover
  downloadPolicyMenuPosition: { top: number; left?: number; right?: number } = { top: 0 };

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(_event: KeyboardEvent): void {
    if (this.activeActionMenuDoc) {
      this.closeActionMenu();
      return;
    }
    if (this.editingDownloadPolicyDoc) {
      this.closeDownloadPolicyModal();
      return;
    }
    if (this.showUploadModal) {
      this.closeUploadModal();
      return;
    }
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

  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.activeActionMenuDoc) {
      this.closeActionMenu();
    }
    if (this.editingDownloadPolicyDoc) {
      this.closeDownloadPolicyModal();
    }
  }

  @HostListener('window:scroll')
  @HostListener('window:resize')
  onWindowChange(): void {
    if (this.activeActionMenuDoc) {
      this.closeActionMenu();
    }
    if (this.editingDownloadPolicyDoc) {
      this.closeDownloadPolicyModal();
    }
  }

  toggleActionMenu(doc: IDocument, event: MouseEvent): void {
    event.stopPropagation();
    if (this.editingDownloadPolicyDoc) {
      this.closeDownloadPolicyModal();
    }
    if (this.activeActionMenuDoc?.id === doc.id) {
      this.closeActionMenu();
      return;
    }

    const button = (event.currentTarget as HTMLElement) || (event.target as HTMLElement);
    const rect = button.getBoundingClientRect();
    const menuWidth = 192; // w-48 = 192px
    const menuEstimatedHeight = this.isAdmin ? 210 : 100;

    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < menuEstimatedHeight && rect.top > menuEstimatedHeight;

    const top = openUpward ? Math.max(8, rect.top - menuEstimatedHeight - 4) : rect.bottom + 4;

    let right: number | undefined = Math.max(8, window.innerWidth - rect.right);
    let left: number | undefined;

    if (rect.right < menuWidth + 12) {
      right = undefined;
      left = Math.max(8, rect.left);
    }

    this.menuPosition = { top, right, left };
    this.activeActionMenuDoc = doc;
  }

  closeActionMenu(): void {
    this.activeActionMenuDoc = null;
  }

  handleMenuPreview(doc: IDocument): void {
    this.closeActionMenu();
    this.openTabularPreview(doc);
  }

  handleMenuDownload(doc: IDocument): void {
    this.closeActionMenu();
    this.downloadDoc(doc);
  }

  handleMenuReplace(doc: IDocument, input: HTMLInputElement): void {
    this.closeActionMenu();
    this.triggerReplace(doc, input);
  }

  handleMenuMove(doc: IDocument): void {
    this.closeActionMenu();
    this.openMoveModal(doc);
  }

  handleMenuDelete(docId: string): void {
    this.closeActionMenu();
    this.deleteDoc(docId);
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
    this.loadFolders();
    this.loadDocuments();
  }

  loadFolders(): void {
    if (typeof this.apiService?.getFolders === 'function') {
      this.apiService.getFolders().subscribe({
        next: (folders) => {
          this.folderList = folders || [];
        },
        error: () => {},
      });
    }
  }

  getFolderPolicy(folderName?: string): FolderDownloadPolicy {
    if (!folderName || !folderName.trim()) return 'allowed';
    const f = this.folderList.find((x) => x.name.toLowerCase() === folderName.trim().toLowerCase());
    return f?.downloadPolicy || 'allowed';
  }

  get activeFolderDownloadPolicy(): FolderDownloadPolicy {
    return this.getFolderPolicy(this.activeFolder || '');
  }

  toggleActiveFolderDownloadPolicy(): void {
    if (!this.activeFolder || !this.isAdmin) return;
    const current = this.activeFolderDownloadPolicy;
    const nextPolicy: FolderDownloadPolicy = current === 'allowed' ? 'restricted' : 'allowed';
    this.apiService.updateFolderDownloadPolicy(this.activeFolder, nextPolicy).subscribe({
      next: (updated) => {
        const idx = this.folderList.findIndex((x) => x.name.toLowerCase() === this.activeFolder!.toLowerCase());
        if (idx !== -1) {
          this.folderList[idx] = updated;
        } else {
          this.folderList.push(updated);
        }
        this.loadDocuments();
        this.showToast(`Folder download policy set to ${nextPolicy}`);
      },
      error: (err) => {
        console.error('Failed to update folder policy:', err);
        this.showToast(err?.error?.message || 'Failed to update folder download policy');
      },
    });
  }

  openDownloadPolicyModal(doc: IDocument, event?: MouseEvent): void {
    if (!this.isAdmin) return;
    if (this.editingDownloadPolicyDoc?.id === doc.id) {
      this.closeDownloadPolicyModal();
      return;
    }
    this.closeActionMenu();

    if (event) {
      event.stopPropagation();
      const button = (event.currentTarget as HTMLElement) || (event.target as HTMLElement);
      const rect = button.getBoundingClientRect();
      const menuWidth = 256; // w-64 = 256px
      const menuEstimatedHeight = 180;

      const spaceBelow = window.innerHeight - rect.bottom;
      const openUpward = spaceBelow < menuEstimatedHeight && rect.top > menuEstimatedHeight;

      const top = openUpward ? Math.max(8, rect.top - menuEstimatedHeight - 4) : rect.bottom + 4;

      let left: number | undefined = Math.max(8, rect.left);
      let right: number | undefined;

      if (left + menuWidth > window.innerWidth - 8) {
        left = undefined;
        right = Math.max(8, window.innerWidth - rect.right);
      }

      this.downloadPolicyMenuPosition = { top, left, right };
    }

    this.editingDownloadPolicyDoc = doc;
    this.selectedDocDownloadPolicy = (doc.downloadPolicy as DocumentDownloadPolicy) || 'inherit';
  }

  setDocDownloadPolicy(policy: DocumentDownloadPolicy): void {
    if (!this.editingDownloadPolicyDoc) return;
    this.selectedDocDownloadPolicy = policy;
    this.saveDocumentDownloadPolicy();
  }

  closeDownloadPolicyModal(): void {
    this.editingDownloadPolicyDoc = null;
    this.isSavingDocDownloadPolicy = false;
  }

  saveDocumentDownloadPolicy(): void {
    if (!this.editingDownloadPolicyDoc) return;
    this.isSavingDocDownloadPolicy = true;
    const docId = this.editingDownloadPolicyDoc.id;
    const policy = this.selectedDocDownloadPolicy;

    this.apiService.updateDocumentDownloadPolicy(docId, policy).subscribe({
      next: (updatedDoc) => {
        const idx = this.documents.findIndex((d) => d.id === docId);
        if (idx !== -1) {
          this.documents[idx] = updatedDoc;
        }
        this.isSavingDocDownloadPolicy = false;
        this.closeDownloadPolicyModal();
        this.showToast(`Download policy updated for ${updatedDoc.originalName}`);
      },
      error: (err) => {
        this.isSavingDocDownloadPolicy = false;
        this.showToast(err?.error?.message || 'Failed to update download policy');
      },
    });
  }

  canAccessDoc(doc: IDocument): boolean {
    if (this.isAdmin) return true;
    return doc.hasAccess !== false;
  }

  canDownloadDoc(doc: IDocument): boolean {
    if (!this.canAccessDoc(doc)) return false;
    return doc.effectiveDownloadPolicy !== 'restricted';
  }

  downloadDoc(doc: IDocument): void {
    if (!this.canAccessDoc(doc)) return;
    if (!this.canDownloadDoc(doc)) {
      this.showToast("This file can't be downloaded.");
      return;
    }
    this.apiService.triggerFileDownload(doc.id, doc.originalName).catch((err) => {
      console.error('File download error:', err);
      this.showToast(err?.error?.message || "This file can't be downloaded.");
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }

  isTabular(doc: IDocument): boolean {
    const ext = (doc.fileType || '').toLowerCase();
    return ['csv', 'xlsx', 'xls'].includes(ext) || doc.sourceType === 'tabular' || !!(doc.sheets && doc.sheets.length > 0);
  }

  onRowClick(doc: IDocument): void {
    if (this.isTabular(doc) && this.canAccessDoc(doc)) {
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
    input.value = '';
    if (this.isAdmin) {
      this.pendingUploadFile = file;
      this.uploadDownloadPolicy = 'inherit';
      this.showUploadModal = true;
    } else {
      this.uploadFile(file);
    }
  }

  confirmUpload(): void {
    if (!this.pendingUploadFile) return;
    const file = this.pendingUploadFile;
    const policy = this.uploadDownloadPolicy;
    this.closeUploadModal();
    this.uploadFile(file, policy);
  }

  closeUploadModal(): void {
    this.showUploadModal = false;
    this.pendingUploadFile = null;
    this.uploadDownloadPolicy = 'inherit';
  }

  uploadFile(file: File, downloadPolicy: DocumentDownloadPolicy = 'inherit'): void {
    this.uploading = true;
    this.uploadError = '';
    this.apiService.uploadDocument(file, this.activeFolder || undefined, [], downloadPolicy).subscribe({
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

  getAllDistinctFolderPaths(): string[] {
    const set = new Set<string>();
    for (const f of this.folderList) {
      if (f.name && f.name.trim()) set.add(f.name.trim());
    }
    for (const doc of this.documents) {
      if (doc.folder && doc.folder.trim()) set.add(doc.folder.trim());
    }
    return Array.from(set).sort();
  }

  get moveBreadcrumbSegments(): { label: string; path: string }[] {
    const segments = [{ label: 'All Files', path: '' }];
    if (!this.moveModalCurrentNavPath) return segments;
    const parts = this.moveModalCurrentNavPath.split('/').filter(Boolean);
    let accumulated = '';
    for (const part of parts) {
      accumulated = accumulated ? `${accumulated}/${part}` : part;
      segments.push({ label: part, path: accumulated });
    }
    return segments;
  }

  getMoveSubfolders(currentNavPath: string): { name: string; fullPath: string; hasSubfolders: boolean; subfolderCount: number }[] {
    const allPaths = this.getAllDistinctFolderPaths();
    const prefix = currentNavPath ? `${currentNavPath}/` : '';
    const childrenMap = new Map<string, { fullPath: string; hasSubfolders: boolean; subfolderCount: number }>();

    for (const p of allPaths) {
      if (!currentNavPath) {
        const topLevel = p.split('/')[0];
        const existing = childrenMap.get(topLevel);
        const fullPath = topLevel;
        const isDeeper = p.includes('/');
        if (!existing) {
          childrenMap.set(topLevel, { fullPath, hasSubfolders: isDeeper, subfolderCount: isDeeper ? 1 : 0 });
        } else if (isDeeper) {
          existing.hasSubfolders = true;
          existing.subfolderCount++;
        }
      } else if (p.startsWith(prefix) && p !== currentNavPath) {
        const remainder = p.slice(prefix.length);
        const directChild = remainder.split('/')[0];
        const fullChildPath = `${prefix}${directChild}`;
        const isDeeper = remainder.includes('/');
        const existing = childrenMap.get(directChild);
        if (!existing) {
          childrenMap.set(directChild, { fullPath: fullChildPath, hasSubfolders: isDeeper, subfolderCount: isDeeper ? 1 : 0 });
        } else if (isDeeper) {
          existing.hasSubfolders = true;
          existing.subfolderCount++;
        }
      }
    }

    return Array.from(childrenMap.entries())
      .map(([name, data]) => ({
        name,
        fullPath: data.fullPath,
        hasSubfolders: data.hasSubfolders,
        subfolderCount: data.subfolderCount,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  navigateMoveFolder(path: string): void {
    this.moveModalCurrentNavPath = (path || '').trim();
    this.moveErrorMessage = null;
  }

  navigateMoveFolderUp(): void {
    if (!this.moveModalCurrentNavPath) return;
    const parts = this.moveModalCurrentNavPath.split('/').filter(Boolean);
    parts.pop();
    this.moveModalCurrentNavPath = parts.join('/');
    this.moveErrorMessage = null;
  }

  selectMoveDestination(path: string): void {
    this.moveSelectedDestination = (path || '').trim();
    this.moveErrorMessage = null;
  }

  isDestinationCurrentLocation(): boolean {
    if (!this.moveTargetDoc || this.moveSelectedDestination === null) return false;
    const currentLoc = (this.moveTargetDoc.folder || '').trim();
    return this.moveSelectedDestination === currentLoc;
  }

  openMoveModal(doc: IDocument): void {
    this.moveTargetDoc = doc;
    this.moveModalCurrentNavPath = '';
    this.moveSelectedDestination = null;
    this.moveErrorMessage = null;
    this.isMovingFile = false;
    this.showMoveModal = true;
  }

  closeMoveModal(): void {
    this.showMoveModal = false;
    this.moveTargetDoc = null;
    this.moveModalCurrentNavPath = '';
    this.moveSelectedDestination = null;
    this.moveErrorMessage = null;
    this.isMovingFile = false;
  }

  executeMove(): void {
    if (!this.moveTargetDoc || this.moveSelectedDestination === null) return;
    if (this.isDestinationCurrentLocation()) return;

    this.isMovingFile = true;
    this.moveErrorMessage = null;
    const docToMove = this.moveTargetDoc;
    const targetFolder = this.moveSelectedDestination;

    this.apiService.updateDocumentFolder(docToMove.id, targetFolder).subscribe({
      next: () => {
        this.isMovingFile = false;
        this.triggerToast('File moved successfully.');
        this.closeMoveModal();
        this.loadDocuments();
        this.loadFolders();
      },
      error: (err) => {
        this.isMovingFile = false;
        this.moveErrorMessage = err.error?.message || 'Failed to move file. Please try again.';
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

  showToast(msg: string): void {
    this.triggerToast(msg);
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
