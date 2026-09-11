export type NotificationType = 'direct_message' | 'conversation_shared' | 'message_shared' | 'permission_updated' | 'access_revoked';

export interface INotification {
  id: string;
  userId: string;
  senderId?: string;
  sender?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  type: NotificationType;
  title: string;
  message: string;
  resourceType: 'conversation' | 'message';
  resourceId: string;
  isRead: boolean;
  createdAt: string;
}
