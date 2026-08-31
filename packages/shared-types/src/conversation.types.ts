export interface IConversation {
  id: string;
  userId: string;
  title: string;
  collectionId?: string | null;
  attachedResourceIds: string[];
  lastMessageAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ICreateConversationDto {
  title?: string;
  collectionId?: string | null;
  attachedResourceIds?: string[];
}

export interface IUpdateConversationDto {
  title?: string;
  collectionId?: string | null;
  attachedResourceIds?: string[];
}

