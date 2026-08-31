export interface ICollection {
  id: string;
  userId: string;
  name: string;
  sharedMemory?: string;
  summaryVersion?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ICreateCollectionDto {
  name: string;
}

export interface IUpdateCollectionDto {
  name: string;
}

export interface IMoveConversationDto {
  collectionId: string | null;
}
