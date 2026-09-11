import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, timeout, firstValueFrom } from 'rxjs';
import {
  IDocument,
  IDataset,
  IConversation,
  ICreateConversationDto,
  IUpdateConversationDto,
  ICollection,
  ICreateCollectionDto,
  IUpdateCollectionDto,
  IMoveConversationDto,
  IMessage,
  ISendMessageDto,
  IMentionQueryResult,
  ISendMessageResponse,
  IUser,
  IChangePasswordDto,
  IChangeMasterPasswordDto,
  ICreateUserResult,
  IFolder,
  ICreateFolderDto,
  IUpdateFolderDto,
  DocumentDownloadPolicy,
  FolderDownloadPolicy,
  IUserPresence,
  IOrgMember,
  IConversationShare,
  ISharedConversationItem,
  IShareConversationDto,
  IUpdateSharePermissionDto,
  IMessageShare,
  IShareMessageDto,
  INotification,
  IDirectConversationItem,
} from '@enter-chat/shared-types';
import { getApiBaseUrl } from '../config/app-config';

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private get baseUrl(): string {
    return getApiBaseUrl();
  }

  constructor(private http: HttpClient) {}

  // ---------------- Documents ----------------
  getDocuments(): Observable<IDocument[]> {
    return this.http.get<IDocument[]>(`${this.baseUrl}/documents`);
  }

  getDocument(id: string): Observable<IDocument> {
    return this.http.get<IDocument>(`${this.baseUrl}/documents/${id}`);
  }

  uploadDocument(
    file: File,
    folder: string = '',
    allowedDepartments: string[] = [],
    downloadPolicy?: DocumentDownloadPolicy,
  ): Observable<IDocument> {
    const formData = new FormData();
    formData.append('file', file);
    if (folder) {
      formData.append('folder', folder);
    }
    if (allowedDepartments && allowedDepartments.length > 0) {
      formData.append('allowedDepartments', JSON.stringify(allowedDepartments));
    }
    if (downloadPolicy) {
      formData.append('downloadPolicy', downloadPolicy);
    }
    return this.http.post<IDocument>(`${this.baseUrl}/documents/upload`, formData);
  }

  downloadDocument(id: string): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/documents/${id}/download`, {
      responseType: 'blob',
    });
  }

  async triggerFileDownload(id: string, fileName: string): Promise<void> {
    const blob = await firstValueFrom(this.downloadDocument(id));
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName || 'document.pdf');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  updateDocumentDownloadPolicy(
    id: string,
    downloadPolicy: DocumentDownloadPolicy,
  ): Observable<IDocument> {
    return this.http.patch<IDocument>(`${this.baseUrl}/documents/${id}/download-policy`, {
      downloadPolicy,
    });
  }

  replaceDocument(id: string, file: File): Observable<IDocument> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<IDocument>(`${this.baseUrl}/documents/${id}/replace`, formData);
  }

  retryDocument(id: string): Observable<IDocument> {
    return this.http.post<IDocument>(`${this.baseUrl}/documents/retry/${id}`, {});
  }

  updateDocumentFolder(id: string, folder: string): Observable<IDocument> {
    return this.http.patch<IDocument>(`${this.baseUrl}/documents/${id}/folder`, { folder });
  }

  deleteDocument(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/documents/${id}`);
  }

  // ---------------- Datasets ----------------
  getDatasets(): Observable<IDataset[]> {
    return this.http.get<IDataset[]>(`${this.baseUrl}/datasets`);
  }

  getDataset(id: string): Observable<IDataset> {
    return this.http.get<IDataset>(`${this.baseUrl}/datasets/${id}`);
  }

  uploadDataset(file: File, folder: string = ''): Observable<IDataset> {
    const formData = new FormData();
    formData.append('file', file);
    if (folder) {
      formData.append('folder', folder);
    }
    return this.http.post<IDataset>(`${this.baseUrl}/datasets/upload`, formData);
  }

  replaceDataset(id: string, file: File): Observable<IDataset> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<IDataset>(`${this.baseUrl}/datasets/${id}/replace`, formData);
  }

  retryDataset(id: string): Observable<IDataset> {
    return this.http.post<IDataset>(`${this.baseUrl}/datasets/retry/${id}`, {});
  }

  updateDatasetFolder(id: string, folder: string): Observable<IDataset> {
    return this.http.patch<IDataset>(`${this.baseUrl}/datasets/${id}/folder`, { folder });
  }

  deleteDataset(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/datasets/${id}`);
  }

  // ---------------- Collections ----------------
  getCollections(): Observable<ICollection[]> {
    return this.http.get<ICollection[]>(`${this.baseUrl}/collections`);
  }

  getCollection(id: string): Observable<ICollection> {
    return this.http.get<ICollection>(`${this.baseUrl}/collections/${id}`);
  }

  createCollection(dto: ICreateCollectionDto): Observable<ICollection> {
    return this.http.post<ICollection>(`${this.baseUrl}/collections`, dto);
  }

  renameCollection(id: string, dto: IUpdateCollectionDto): Observable<ICollection> {
    return this.http.patch<ICollection>(`${this.baseUrl}/collections/${id}`, dto);
  }

  deleteCollection(id: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.baseUrl}/collections/${id}`);
  }

  moveConversationToCollection(conversationId: string, collectionId: string | null): Observable<{ success: boolean }> {
    return this.http.patch<{ success: boolean }>(`${this.baseUrl}/collections/move/${conversationId}`, { collectionId });
  }

  // ---------------- Conversations ----------------
  getConversations(archived?: boolean): Observable<IConversation[]> {
    let params = new HttpParams();
    if (archived !== undefined) {
      params = params.set('archived', String(archived));
    }
    return this.http.get<IConversation[]>(`${this.baseUrl}/conversations`, { params });
  }

  getConversation(id: string): Observable<IConversation> {
    return this.http.get<IConversation>(`${this.baseUrl}/conversations/${id}`);
  }

  createConversation(dto: ICreateConversationDto): Observable<IConversation> {
    return this.http.post<IConversation>(`${this.baseUrl}/conversations`, dto);
  }

  updateConversation(id: string, dto: IUpdateConversationDto): Observable<IConversation> {
    return this.http.patch<IConversation>(`${this.baseUrl}/conversations/${id}`, dto);
  }

  pinConversation(id: string): Observable<IConversation> {
    return this.updateConversation(id, { pinned: true });
  }

  unpinConversation(id: string): Observable<IConversation> {
    return this.updateConversation(id, { pinned: false });
  }

  archiveConversation(id: string): Observable<IConversation> {
    return this.updateConversation(id, { archived: true });
  }

  unarchiveConversation(id: string): Observable<IConversation> {
    return this.updateConversation(id, { archived: false });
  }

  searchConversations(query: string, archived?: boolean): Observable<IConversation[]> {
    let params = new HttpParams().set('q', query);
    if (archived !== undefined) {
      params = params.set('archived', String(archived));
    }
    return this.http.get<IConversation[]>(`${this.baseUrl}/conversations/search`, { params });
  }

  deleteConversation(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/conversations/${id}`);
  }

  // ---------------- Messages ----------------
  getActiveGenerations(): Observable<{ activeConversationIds: string[] }> {
    return this.http.get<{ activeConversationIds: string[] }>(`${this.baseUrl}/messages/active-generations`);
  }

  getMessages(conversationId: string): Observable<IMessage[]> {
    return this.http.get<IMessage[]>(`${this.baseUrl}/messages/conversation/${conversationId}`);
  }

  sendMessage(dto: ISendMessageDto): Observable<ISendMessageResponse> {
    return this.http.post<ISendMessageResponse>(
      `${this.baseUrl}/messages`,
      dto,
    );
  }

  // ---------------- Mentions ----------------
  searchMentions(query: string = ''): Observable<IMentionQueryResult> {
    const params = new HttpParams().set('query', query);
    return this.http.get<IMentionQueryResult>(`${this.baseUrl}/mentions`, { params });
  }

  // ---------------- Access Requests ----------------
  createAccessRequest(dto: any): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/access-requests`, dto);
  }

  getMyAccessRequests(): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/access-requests/me`);
  }

  getPendingAccessRequests(): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/access-requests/pending`);
  }

  getAccessRequestHistory(query: any = {}): Observable<any> {
    let params = new HttpParams();
    Object.keys(query).forEach((key) => {
      if (query[key] !== undefined && query[key] !== null && query[key] !== '') {
        params = params.set(key, query[key]);
      }
    });
    return this.http.get<any>(`${this.baseUrl}/access-requests/history`, { params });
  }

  updateAccessRequestStatus(id: string, dto: any): Observable<any> {
    return this.http.patch<any>(`${this.baseUrl}/access-requests/${id}/status`, dto);
  }

  // ---------------- Users ----------------
  getProfile(): Observable<IUser> {
    return this.http.get<IUser>(`${this.baseUrl}/users/me`);
  }

  getAllUsers(): Observable<IUser[]> {
    return this.http.get<IUser[]>(`${this.baseUrl}/users`);
  }

  createUser(dto: any): Observable<ICreateUserResult> {
    return this.http.post<ICreateUserResult>(`${this.baseUrl}/users`, dto).pipe(
      timeout(15000),
    );
  }

  completeOnboarding(): Observable<IUser> {
    return this.http.patch<IUser>(`${this.baseUrl}/users/me/onboarding`, {});
  }

  updateUser(id: string, dto: any): Observable<IUser> {
    return this.http.patch<IUser>(`${this.baseUrl}/users/${id}`, dto);
  }

  deleteUser(id: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.baseUrl}/users/${id}`);
  }

  changePassword(dto: IChangePasswordDto): Observable<{ message: string }> {
    return this.http.patch<{ message: string }>(`${this.baseUrl}/users/me/password`, dto);
  }

  changeMasterPassword(dto: IChangeMasterPasswordDto): Observable<{ message: string }> {
    return this.http.patch<{ message: string }>(`${this.baseUrl}/system-settings/master-password`, dto);
  }

  // ---------------- Roles & Permissions ----------------
  getRoles(): Observable<{ roles: any[] }> {
    return this.http.get<{ roles: any[] }>(`${this.baseUrl}/roles`);
  }

  createRole(dto: any): Observable<{ role: any }> {
    return this.http.post<{ role: any }>(`${this.baseUrl}/roles`, dto);
  }

  updateRole(id: string, dto: any): Observable<{ role: any }> {
    return this.http.put<{ role: any }>(`${this.baseUrl}/roles/${id}`, dto);
  }

  deleteRole(id: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.baseUrl}/roles/${id}`);
  }

  // ---------------- Folders ----------------
  getFolders(): Observable<IFolder[]> {
    return this.http.get<IFolder[]>(`${this.baseUrl}/folders`);
  }

  createFolder(dtoOrName: any, allowedDepartments?: string[]): Observable<any> {
    if (typeof dtoOrName === 'string') {
      return this.http.post<any>(`${this.baseUrl}/folders`, { name: dtoOrName, allowedDepartments: allowedDepartments || [] });
    }
    return this.http.post<any>(`${this.baseUrl}/folders`, dtoOrName);
  }

  updateFolder(id: string, dto: IUpdateFolderDto): Observable<IFolder> {
    return this.http.patch<IFolder>(`${this.baseUrl}/folders/${id}`, dto);
  }

  updateFolderDownloadPolicy(
    folderName: string,
    downloadPolicy: FolderDownloadPolicy,
  ): Observable<IFolder> {
    return this.http.patch<IFolder>(
      `${this.baseUrl}/folders/by-name/${encodeURIComponent(folderName)}/download-policy`,
      { downloadPolicy },
    );
  }

  deleteFolder(idOrName: string): Observable<void> {
    if (idOrName.includes('/') || idOrName.length !== 24) {
      return this.http.delete<void>(`${this.baseUrl}/folders/by-name/${encodeURIComponent(idOrName)}`);
    }
    return this.http.delete<void>(`${this.baseUrl}/folders/${idOrName}`);
  }

  deleteFolderByName(name: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/folders/by-name/${encodeURIComponent(name)}`);
  }

  // ---------------- Presence ----------------
  recordHeartbeat(): Observable<{ success: boolean; lastSeenAt: string }> {
    return this.http.post<{ success: boolean; lastSeenAt: string }>(`${this.baseUrl}/users/presence/heartbeat`, {});
  }

  getOrganizationMembers(search?: string): Observable<IOrgMember[]> {
    let params = new HttpParams();
    if (search && search.trim()) {
      params = params.set('search', search.trim());
    }
    return this.http.get<IOrgMember[]>(`${this.baseUrl}/users/organization-members`, { params });
  }

  // ---------------- Direct Messaging ----------------
  getDirectConversations(): Observable<IDirectConversationItem[]> {
    return this.http.get<IDirectConversationItem[]>(`${this.baseUrl}/conversations/direct`);
  }

  getOrCreateDirectConversation(targetUserId: string): Observable<IConversation> {
    return this.http.post<IConversation>(`${this.baseUrl}/conversations/direct`, { targetUserId });
  }

  getDirectConversation(conversationId: string): Observable<IConversation> {
    return this.http.get<IConversation>(`${this.baseUrl}/conversations/direct/${conversationId}`);
  }

  markDirectConversationAsRead(conversationId: string): Observable<{ success: boolean }> {
    return this.http.patch<{ success: boolean }>(`${this.baseUrl}/conversations/direct/${conversationId}/read`, {});
  }

  // ---------------- Sharing & Collaboration ----------------
  getSharedConversations(): Observable<ISharedConversationItem[]> {
    return this.http.get<ISharedConversationItem[]>(`${this.baseUrl}/conversations/shared/with-me`);
  }

  getConversationShares(conversationId: string): Observable<IConversationShare[]> {
    return this.http.get<IConversationShare[]>(`${this.baseUrl}/conversations/${conversationId}/shares`);
  }

  shareConversation(conversationId: string, dto: IShareConversationDto): Observable<IConversationShare[]> {
    return this.http.post<IConversationShare[]>(`${this.baseUrl}/conversations/${conversationId}/shares`, dto);
  }

  updateSharePermission(conversationId: string, targetUserId: string, dto: IUpdateSharePermissionDto): Observable<IConversationShare> {
    return this.http.patch<IConversationShare>(`${this.baseUrl}/conversations/${conversationId}/shares/${targetUserId}`, dto);
  }

  revokeShare(conversationId: string, targetUserId: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.baseUrl}/conversations/${conversationId}/shares/${targetUserId}`);
  }

  leaveSharedConversation(conversationId: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.baseUrl}/conversations/${conversationId}/shares/leave`);
  }

  shareMessage(messageId: string, dto: IShareMessageDto): Observable<IMessageShare[]> {
    return this.http.post<IMessageShare[]>(`${this.baseUrl}/messages/${messageId}/share`, dto);
  }

  getSharedMessage(messageId: string): Observable<IMessageShare> {
    return this.http.get<IMessageShare>(`${this.baseUrl}/messages/${messageId}/shared`);
  }

  getSharedMessages(): Observable<IMessageShare[]> {
    return this.http.get<IMessageShare[]>(`${this.baseUrl}/messages/shared/with-me`);
  }

  // ---------------- Notifications ----------------
  getNotifications(limit?: number): Observable<INotification[]> {
    let params = new HttpParams();
    if (limit) {
      params = params.set('limit', String(limit));
    }
    return this.http.get<INotification[]>(`${this.baseUrl}/notifications`, { params });
  }

  getUnreadNotificationCount(): Observable<{ count: number }> {
    return this.http.get<{ count: number }>(`${this.baseUrl}/notifications/unread-count`);
  }

  markNotificationAsRead(id: string): Observable<{ success: boolean }> {
    return this.http.patch<{ success: boolean }>(`${this.baseUrl}/notifications/${id}/read`, {});
  }

  markAllNotificationsAsRead(): Observable<{ success: boolean }> {
    return this.http.patch<{ success: boolean }>(`${this.baseUrl}/notifications/read-all`, {});
  }

  // ---------------- Voice Transcription ----------------
  transcribeAudio(audioBlob: Blob): Observable<{ transcript: string }> {
    const formData = new FormData();
    formData.append('file', audioBlob, 'recording.webm');
    return this.http.post<{ transcript: string }>(`${this.baseUrl}/messages/transcribe`, formData);
  }
}
