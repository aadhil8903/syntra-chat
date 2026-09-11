import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import {
  IConversationShare,
  ISharedConversationItem,
  IShareConversationDto,
  IUpdateSharePermissionDto,
  IMessageShare,
  IShareMessageDto,
  IOrgMember,
} from '@enter-chat/shared-types';

@Injectable({
  providedIn: 'root',
})
export class SharingService {
  private apiService = inject(ApiService);

  getOrganizationMembers(search?: string): Observable<IOrgMember[]> {
    return this.apiService.getOrganizationMembers(search);
  }

  getSharedConversations(): Observable<ISharedConversationItem[]> {
    return this.apiService.getSharedConversations();
  }

  getConversationShares(conversationId: string): Observable<IConversationShare[]> {
    return this.apiService.getConversationShares(conversationId);
  }

  shareConversation(
    conversationId: string,
    dto: IShareConversationDto,
  ): Observable<IConversationShare[]> {
    return this.apiService.shareConversation(conversationId, dto);
  }

  updateSharePermission(
    conversationId: string,
    targetUserId: string,
    dto: IUpdateSharePermissionDto,
  ): Observable<IConversationShare> {
    return this.apiService.updateSharePermission(conversationId, targetUserId, dto);
  }

  revokeShare(conversationId: string, targetUserId: string): Observable<{ success: boolean }> {
    return this.apiService.revokeShare(conversationId, targetUserId);
  }

  leaveSharedConversation(conversationId: string): Observable<{ success: boolean }> {
    return this.apiService.leaveSharedConversation(conversationId);
  }

  shareMessage(messageId: string, dto: IShareMessageDto): Observable<IMessageShare[]> {
    return this.apiService.shareMessage(messageId, dto);
  }

  getSharedMessage(messageId: string): Observable<IMessageShare> {
    return this.apiService.getSharedMessage(messageId);
  }

  getSharedMessages(): Observable<IMessageShare[]> {
    return this.apiService.getSharedMessages();
  }
}
