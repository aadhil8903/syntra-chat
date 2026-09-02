export interface IActiveScope {
  type: 'document' | 'folder' | 'dataset';
  id: string;
  name: string;
  updatedAt?: string;
}

export interface IConversation {
  id: string;
  userId: string;
  title: string;
  collectionId?: string | null;
  attachedResourceIds: string[];
  activeScope?: IActiveScope | null;
  lastMessageAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ICreateConversationDto {
  title?: string;
  collectionId?: string | null;
  attachedResourceIds?: string[];
  activeScope?: IActiveScope | null;
}

export interface IUpdateConversationDto {
  title?: string;
  collectionId?: string | null;
  attachedResourceIds?: string[];
  activeScope?: IActiveScope | null;
}
