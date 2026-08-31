export enum MentionResourceType {
  DOCUMENT = 'document',
  DATASET = 'dataset',
  FOLDER = 'folder',
}

export interface IMentionOption {
  id: string;
  name: string;
  type: MentionResourceType;
  fileType: string;
  status: string;
  detail?: string;
  folderPath?: string;
}

export interface IMentionQueryResult {
  query: string;
  results: IMentionOption[];
}

