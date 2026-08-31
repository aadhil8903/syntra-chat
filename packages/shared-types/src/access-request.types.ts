export enum AccessRequestStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum ResourceType {
  DOCUMENT = 'document',
  DATASET = 'dataset',
  FOLDER = 'folder',
}

export interface IAccessRequest {
  id: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  resourceId: string;
  resourceType: ResourceType;
  resourceName?: string;
  folderPath?: string;
  reason?: string;
  status: AccessRequestStatus;
  resolvedBy?: string;
  resolvedByName?: string;
  resolvedByEmail?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ICreateAccessRequestDto {
  resourceId: string;
  resourceType: ResourceType;
  resourceName?: string;
  folderPath?: string;
  reason?: string;
}

export interface IUpdateAccessRequestDto {
  status: AccessRequestStatus;
}

export interface IAccessRequestHistoryQuery {
  status?: AccessRequestStatus;
  requesterId?: string;
  resolvedBy?: string;
  from?: string;
  to?: string;
  dateField?: 'requestedAt' | 'resolvedAt';
  page?: number;
  limit?: number;
}

export interface IAccessRequestHistoryResponse {
  items: IAccessRequest[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}


