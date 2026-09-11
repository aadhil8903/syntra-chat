export * from './auth.types';
export * from './document.types';
export * from './dataset.types';
export * from './conversation.types';
export * from './message.types';
export * from './mention.types';
export * from './ai.types';
export * from './access-request.types';

export * from './folder.types';
export * from './collection.types';
export * from './notification.types';


// ---------------- App Configuration & Branding Constants ----------------
export const APP_CONFIG = {
  name: 'Syntra Chat',
  shortName: 'Syntra',
  codeName: 'syntra-chat',
  storagePrefix: 'syntra_chat',
  tagline: 'Enterprise Knowledge & Data Intelligence Platform',
  supportEmail: 'support@syntrachat.internal',
  noReplyEmail: 'no-reply@syntrachat.internal',
  reportHeader: 'SYNTRA CHAT  |  EXECUTIVE INTELLIGENCE REPORT',
  reportFooter: 'CONFIDENTIAL & PROPRIETARY  •  SYNTRA CHAT INTELLIGENCE PLATFORM',
  systemPersonaName: 'Syntra Chat',
} as const;

export const APP_NAME = APP_CONFIG.name;
