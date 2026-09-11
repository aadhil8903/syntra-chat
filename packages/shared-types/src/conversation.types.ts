export type ConversationType = 'ai' | 'direct';

export interface IActiveScope {
  type: 'document' | 'folder' | 'dataset';
  id: string;
  name: string;
  updatedAt?: string;
}

export interface IConversationLastMessage {
  content: string;
  senderId: string;
  senderName: string;
  createdAt: string;
  role?: string;
  isAi?: boolean;
}

export interface IConversation {
  id: string;
  userId: string;
  type?: ConversationType;
  participants?: string[];
  participantUsers?: import('./auth.types').IOrgMember[];
  title: string;
  collectionId?: string | null;
  attachedResourceIds: string[];
  activeScope?: IActiveScope | null;
  pinned?: boolean;
  archived?: boolean;
  lastMessageAt?: string;
  lastMessage?: IConversationLastMessage | null;
  unreadCount?: number;
  partner?: import('./auth.types').IOrgMember;
  createdAt: string;
  updatedAt: string;
}

export interface ICreateDirectConversationDto {
  targetUserId: string;
}

export interface IDirectConversationItem {
  id: string;
  type: 'direct';
  partner: import('./auth.types').IOrgMember;
  lastMessage?: IConversationLastMessage | null;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ICreateConversationDto {
  title?: string;
  collectionId?: string | null;
  attachedResourceIds?: string[];
  activeScope?: IActiveScope | null;
  pinned?: boolean;
  archived?: boolean;
}

export interface IUpdateConversationDto {
  title?: string;
  collectionId?: string | null;
  attachedResourceIds?: string[];
  activeScope?: IActiveScope | null;
  pinned?: boolean;
  archived?: boolean;
}

export type SharePermission = 'view' | 'contribute';

export interface IConversationShare {
  id: string;
  conversationId: string;
  ownerId: string;
  sharedWithUserId: string;
  sharedWithUser?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    presence?: import('./auth.types').IUserPresence;
  };
  permission: SharePermission;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface IShareConversationDto {
  userIds: string[];
  permission: SharePermission;
}

export interface IUpdateSharePermissionDto {
  permission: SharePermission;
}

export interface ISharedConversationItem extends IConversation {
  permission: SharePermission;
  sharedAt: string;
  owner?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    presence?: import('./auth.types').IUserPresence;
  };
}
