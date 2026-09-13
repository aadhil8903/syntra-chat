import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MessageEntity, MessageEntityDocument } from './schemas/message.schema';
import { ConversationEntity, ConversationEntityDocument } from '../conversations/schemas/conversation.schema';
import { SendMessageDto } from './dto/send-message.dto';
import {
  IMessage,
  MessageRole,
  ISendMessageResponse,
  IActiveScope,
  IDownloadableFile,
  AgentIntent,
  IMessageShare,
  IMessageAuthor,
} from '@enter-chat/shared-types';
import { OwnershipService } from '../permissions/services/ownership.service';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';
import { MentionsService } from '../mentions/mentions.service';
import { CollectionsService } from '../collections/collections.service';
import { DocumentsService } from '../documents/documents.service';
import { MessageShareEntity, MessageShareDocument } from './schemas/message-share.schema';
import { ConversationShareEntity, ConversationShareDocument } from '../conversations/schemas/conversation-share.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { MessagesEventsService } from './messages-events.service';

interface IResolvedScopeData {
  explicitMentionedIds: string[];
  effectiveResourceIds: string[];
  activeScope: IActiveScope | null;
  resolutionSource: 'explicit_mention' | 'active_scope' | 'none';
  updatedActiveScopePayload?: IActiveScope | null;
}

/**
 * Checks if a user's prompt is a completely unrelated external topic
 * (such as world trivia, math puzzles, poetry) that should not have
 * the active document/folder scope injected into the LLM request.
 */
function isClearlyUnrelatedQuestion(content: string): boolean {
  const trimmed = content.trim().toLowerCase();
  if (!trimmed) return true;

  // Pure general trivia or small talk patterns
  const generalTriviaPatterns = [
    /^what is the capital of/i,
    /^(tell me a joke|tell a joke)/i,
    /^who (was|is) (napoleon|albert einstein|george washington|shakespeare|cleopatra|newton)/i,
    /^what is (the speed of light|the distance to the moon|pi|2\s*\+\s*2)/i,
    /^(write a poem|write a song|write a story) about (the ocean|trees|nature|cats|dogs|spring|space)/i,
    /^(how are you|hello|hi|hey|good morning|good evening)$/i,
  ];

  if (generalTriviaPatterns.some((pattern) => pattern.test(trimmed))) {
    return true;
  }

  // Contextual keywords that clearly reference conversation scope or document queries
  const contextualTerms = [
    'file', 'files', 'document', 'documents', 'doc', 'docs', 'folder', 'folders',
    'dataset', 'datasets', 'table', 'chart', 'summary', 'summarize', 'analyze', 'explain',
    'this', 'that', 'it', 'them', 'these', 'those', 'here', 'above', 'previous', 'show',
    'find', 'get', 'calculate', 'average', 'total',
  ];

  if (contextualTerms.some((term) => trimmed.includes(term))) {
    return false;
  }

  return false;
}

/**
 * Detects if a user message is asking to find, get, or download a PDF or file.
 */
export function isPdfDiscoveryRequest(content: string): boolean {
  const lower = content.toLowerCase().trim();
  if (/\b(download|get me the|give me the|give me that|send me the|fetch the|locate the)\b/i.test(lower)) {
    return true;
  }
  const hasRequest = /\b(give me|can i get|can i have|can i download|i want|i need|i wanna|download|find|get|where is|send me|show me|fetch|open|locate)\b/i.test(lower);
  const hasFile = /\b(pdf|file|document|handbook|guide|report|policy|agreement|manual)\b/i.test(lower) || /\.pdf\b/i.test(lower) || /@[a-zA-Z0-9_\-\.]+/i.test(lower) || /\b(it|this|that)\b/i.test(lower);
  return hasRequest && hasFile;
}

/**
 * Detects if a user message is requesting a target-dependent operation (comparison,
 * non-specific plural summarization, or analysis) without sufficient target resources.
 * Returns deterministic clarification prompt to prevent LLM hallucinations.
 */
export function detectUnresolvedTargetOperation(
  content: string,
  effectiveResourceIds: string[],
  activeScope: IActiveScope | null,
): { isUnresolved: boolean; clarificationAnswer?: string } {
  const clean = content.toLowerCase().trim();

  // Target count from explicit resources or active scope
  const targetIds = new Set(effectiveResourceIds || []);
  if (activeScope && activeScope.id) {
    targetIds.add(activeScope.id);
  }
  const targetCount = targetIds.size;

  // 1. Comparison Operation Detection
  const compPatterns = [
    /\bcompare\b/i,
    /\bcomparing\b/i,
    /\bcomparison\b/i,
    /\bdiffer(?:ence|ences)?\s+between\b/i,
    /\bcontrast\s+between\b/i,
    /\bhow\s+do\s+(?:these|the\s+following|the\s+two)\s+(?:files|documents|datasets|spreadsheets)?\s*differ\b/i,
    /\bwhat\s+(?:is|are)\s+the\s+differences?\s+between\s+(?:these|the\s+following|the\s+two)\b/i,
  ];

  const isComparison = compPatterns.some((p) => p.test(clean));
  if (isComparison) {
    if (targetCount < 2) {
      if (targetCount === 1 && activeScope?.name) {
        return {
          isUnresolved: true,
          clarificationAnswer: `Which file would you like to compare with '${activeScope.name}'?`,
        };
      }
      return {
        isUnresolved: true,
        clarificationAnswer: 'Which files would you like me to compare?',
      };
    }
  }

  // 2. Non-specific plural operation check (summarize / analyze / extract without targets)
  const pluralOps: Array<[RegExp, string]> = [
    [/\b(?:summarize|summarise)\s+(?:the\s+following|these|the)\s+(?:files|documents|spreadsheets|datasets)\b/i, 'Which files would you like me to summarize?'],
    [/\b(?:analyze|analyse)\s+(?:the\s+following|these|the)\s+(?:files|documents|spreadsheets|datasets)\b/i, 'Which files would you like me to analyze?'],
    [/\bextract\s+(?:data|information)\s+from\s+(?:the\s+following|these|the)\s+(?:files|documents|spreadsheets|datasets)\b/i, 'Which files would you like me to extract data from?'],
  ];

  for (const [pattern, prompt] of pluralOps) {
    if (pattern.test(clean) && targetCount === 0) {
      return {
        isUnresolved: true,
        clarificationAnswer: prompt,
      };
    }
  }

  return { isUnresolved: false };
}

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);
  private readonly activeGenerationsByUser = new Map<string, Set<string>>();
  private static readonly MAX_CONCURRENT_GENERATIONS = 2;

  constructor(
    @InjectModel(MessageEntity.name)
    private readonly messageModel: Model<MessageEntityDocument>,
    @InjectModel(ConversationEntity.name)
    private readonly conversationModel: Model<ConversationEntityDocument>,
    @InjectModel(MessageShareEntity.name)
    private readonly messageShareModel: Model<MessageShareDocument>,
    @InjectModel(ConversationShareEntity.name)
    private readonly conversationShareModel: Model<ConversationShareDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel('DocumentEntity')
    private readonly documentModel: Model<any>,
    @InjectModel('DatasetEntity')
    private readonly datasetModel: Model<any>,
    private readonly ownershipService: OwnershipService,
    private readonly aiGatewayService: AiGatewayService,
    private readonly mentionsService: MentionsService,
    private readonly collectionsService: CollectionsService,
    private readonly documentsService: DocumentsService,
    private readonly notificationsService: NotificationsService,
    private readonly messagesEventsService: MessagesEventsService,
  ) {}

  getActiveGenerations(userId: string): string[] {
    const active = this.activeGenerationsByUser.get(userId);
    return active ? Array.from(active) : [];
  }

  async findByConversation(userId: string, conversationId: string): Promise<IMessage[]> {
    if (!Types.ObjectId.isValid(conversationId) || conversationId.startsWith('temp-')) {
      return [];
    }

    // Verify conversation ownership, direct conversation membership, or active share access
    const conv = await this.conversationModel.findById(conversationId).lean().exec();
    if (!conv) {
      throw new NotFoundException('Conversation not found');
    }

    if (conv.type === 'direct') {
      const isParticipant = conv.participants && conv.participants.some((p: any) => p.toString() === userId);
      if (!isParticipant) {
        throw new ForbiddenException('You do not have access to this direct conversation');
      }
    } else {
      const isOwner = conv.userId.toString() === userId;
      if (!isOwner) {
        const share = await this.conversationShareModel.findOne({
          conversationId: new Types.ObjectId(conversationId),
          sharedWithUserId: new Types.ObjectId(userId),
        });
        if (!share) {
          throw new ForbiddenException('You do not have access to this conversation');
        }
      }
    }

    const messages = await this.messageModel
      .find({
        conversationId: new Types.ObjectId(conversationId),
      })
      .populate('userId', 'firstName lastName email role')
      .sort({ createdAt: 1 })
      .exec();

    return messages.map((m) => this.toIMessage(m));
  }

  /**
   * Deterministically resolves explicit mentions or active conversation scope.
   * Enforces server-side ACL on every resolution step and maintains conversation-level persistence.
   */
  private async resolveScopeAndResources(
    userId: string,
    conv: ConversationEntityDocument,
    content: string,
    referencedResourceIds: string[] = [],
  ): Promise<IResolvedScopeData> {
    const conversationId = conv._id.toString();

    // 1. Check for structured mentions: @[name](type:id)
    const structuredMatches = [...content.matchAll(/@\[([^\]]+)\]\(([^:]+):([^\)]+)\)/g)];
    const explicitMentionedIds: string[] = [];
    let primaryMention: { type: 'document' | 'folder' | 'dataset'; id: string; name: string } | null = null;

    for (const match of structuredMatches) {
      const name = match[1];
      const type = match[2];
      const targetId = match[3];
      const resolvedId = type === 'folder' ? (targetId.startsWith('folder:') ? targetId : `folder:${targetId}`) : targetId;
      explicitMentionedIds.push(resolvedId);

      if (!primaryMention) {
        primaryMention = {
          type: type === 'folder' ? 'folder' : type === 'dataset' ? 'dataset' : 'document',
          id: resolvedId,
          name,
        };
      }
    }

    // 2. Check for natural text mentions: @filename
    const naturalMatches = content.match(/@[a-zA-Z0-9_.\-]+/g);
    if (naturalMatches && naturalMatches.length > 0) {
      for (const rawMention of naturalMatches) {
        if (rawMention.startsWith('@[') || rawMention.includes('](')) continue;
        const query = rawMention.slice(1).trim();
        if (query && query.length >= 1) {
          try {
            const searchRes = await this.mentionsService.searchMentions(userId, query);
            if (searchRes.results && searchRes.results.length > 0) {
              const exact = searchRes.results.find(
                (r) => r.name.toLowerCase() === query.toLowerCase() || r.name.toLowerCase().startsWith(query.toLowerCase()),
              );
              const target = exact || searchRes.results[0];
              explicitMentionedIds.push(target.id);

              if (!primaryMention) {
                primaryMention = {
                  type: target.type as 'document' | 'folder' | 'dataset',
                  id: target.id,
                  name: target.name,
                };
              }
            }
          } catch (e) {
            // Ignore mention lookup errors
          }
        }
      }
    }

    // 3. Check for plaintext filename mentions in message (e.g. 25_org_chart.xlsx, 10_employee_directory.xlsx)
    try {
      const lowerContent = content.toLowerCase();
      const [allDocs, allDatasets] = await Promise.all([
        this.documentModel.find().select('_id originalName title').exec(),
        this.datasetModel.find().select('_id originalName name').exec(),
      ]);

      for (const d of allDocs) {
        const orig = (d.originalName || d.title || '').toLowerCase();
        const noExt = orig.replace(/\.[a-z0-9]+$/i, '');
        if (orig && (lowerContent.includes(orig) || (noExt.length >= 4 && lowerContent.includes(noExt)))) {
          const idStr = d._id.toString();
          if (!explicitMentionedIds.includes(idStr)) {
            explicitMentionedIds.push(idStr);
            if (!primaryMention) {
              primaryMention = { type: 'document', id: idStr, name: d.originalName || d.title || 'Document' };
            }
          }
        }
      }

      for (const ds of allDatasets) {
        const orig = (ds.originalName || ds.name || '').toLowerCase();
        const noExt = orig.replace(/\.[a-z0-9]+$/i, '');
        if (orig && (lowerContent.includes(orig) || (noExt.length >= 4 && lowerContent.includes(noExt)))) {
          const idStr = ds._id.toString();
          if (!explicitMentionedIds.includes(idStr)) {
            explicitMentionedIds.push(idStr);
            if (!primaryMention) {
              primaryMention = { type: 'dataset', id: idStr, name: ds.originalName || ds.name || 'Dataset' };
            }
          }
        }
      }
    } catch (e) {}

    // Include any DTO referencedResourceIds
    for (const rId of referencedResourceIds) {
      if (!explicitMentionedIds.includes(rId)) {
        explicitMentionedIds.push(rId);
      }
    }

    // ==========================================
    // CASE 1: EXPLICIT MENTION IN CURRENT MESSAGE
    // ==========================================
    if (explicitMentionedIds.length > 0) {
      const expandedResourceIds: string[] = [];
      for (const rId of explicitMentionedIds) {
        if (rId.startsWith('folder:')) {
          const folderName = rId.slice('folder:'.length).replace(/^folder:/, '');
          const folderRegex = new RegExp(`^${folderName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(/.*)?$`, 'i');
          try {
            const [folderDocs, folderDatasets] = await Promise.all([
              this.documentModel.find({ folder: folderRegex }).select('_id').exec(),
              this.datasetModel.find({ folder: folderRegex }).select('_id').exec(),
            ]);
            expandedResourceIds.push(...folderDocs.map((d: any) => d._id.toString()));
            expandedResourceIds.push(...folderDatasets.map((d: any) => d._id.toString()));
          } catch (err) {}
        } else {
          expandedResourceIds.push(rId);
        }
      }

      const uniqueExpandedIds = Array.from(new Set(expandedResourceIds));
      const validated = await this.ownershipService.validateUserResources(userId, uniqueExpandedIds);
      const validAccessibleResourceIds = Array.from(new Set([...validated.validDocumentIds, ...validated.validDatasetIds]));

      // Resolve primary mention name & type for active scope if not yet resolved
      const firstId = explicitMentionedIds[0];
      let scopeType: 'document' | 'folder' | 'dataset' = 'document';
      let scopeName = 'Document';

      if (firstId.startsWith('folder:')) {
        scopeType = 'folder';
        scopeName = firstId.slice('folder:'.length).replace(/^folder:/, '');
      } else {
        try {
          const doc = await this.documentModel.findById(firstId).select('originalName title').exec();
          if (doc) {
            scopeType = 'document';
            scopeName = doc.originalName || doc.title || 'Document';
          } else {
            const ds = await this.datasetModel.findById(firstId).select('originalName name').exec();
            if (ds) {
              scopeType = 'dataset';
              scopeName = ds.originalName || ds.name || 'Dataset';
            }
          }
        } catch (e) {}
      }

      const newActiveScope: IActiveScope = {
        type: scopeType,
        id: firstId,
        name: scopeName,
        updatedAt: new Date().toISOString(),
      };

      this.logger.log(
        `[ACTIVE_SCOPE] conversationId=${conversationId} previousScope=${conv.activeScope?.name || 'none'} explicitMention=${newActiveScope.name} resolvedScope=${newActiveScope.name} resolutionSource=explicit_mention permissionCheck=passed`,
      );

      return {
        explicitMentionedIds,
        effectiveResourceIds: validAccessibleResourceIds,
        activeScope: newActiveScope,
        resolutionSource: 'explicit_mention',
        updatedActiveScopePayload: newActiveScope,
      };
    }

    // ==========================================
    // CASE 2: NO EXPLICIT MENTION — REUSE ACTIVE SCOPE
    // ==========================================
    if (conv.activeScope) {
      const active = conv.activeScope;

      // 1. Check if resource still exists in the database
      let resourceExists = true;
      if (active.type === 'document') {
        const doc = await this.documentModel.findById(active.id).select('_id').exec();
        if (!doc) resourceExists = false;
      } else if (active.type === 'dataset') {
        const ds = await this.datasetModel.findById(active.id).select('_id').exec();
        if (!ds) resourceExists = false;
      }

      if (!resourceExists) {
        this.logger.warn(
          `[ACTIVE_SCOPE] conversationId=${conversationId} previousScope=${active.name} stale=true (deleted/missing) -> clearing activeScope`,
        );
        return {
          explicitMentionedIds: [],
          effectiveResourceIds: [],
          activeScope: null,
          resolutionSource: 'none',
          updatedActiveScopePayload: null,
        };
      }

      // 2. Expand folder if active scope is folder
      const expandedIds: string[] = [];
      if (active.type === 'folder' || active.id.startsWith('folder:')) {
        const folderName = active.id.slice('folder:'.length).replace(/^folder:/, '') || active.name;
        const folderRegex = new RegExp(`^${folderName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(/.*)?$`, 'i');
        try {
          const [folderDocs, folderDatasets] = await Promise.all([
            this.documentModel.find({ folder: folderRegex }).select('_id').exec(),
            this.datasetModel.find({ folder: folderRegex }).select('_id').exec(),
          ]);
          expandedIds.push(...folderDocs.map((d: any) => d._id.toString()));
          expandedIds.push(...folderDatasets.map((d: any) => d._id.toString()));
        } catch (e) {}
      } else {
        expandedIds.push(active.id);
      }

      // 3. Strict Permission Re-Verification
      const validated = await this.ownershipService.validateUserResources(userId, expandedIds);
      const validAccessibleResourceIds = Array.from(new Set([...validated.validDocumentIds, ...validated.validDatasetIds]));

      if (validAccessibleResourceIds.length === 0 && expandedIds.length > 0) {
        this.logger.warn(
          `[ACTIVE_SCOPE] conversationId=${conversationId} scope=${active.name} permissionCheck=denied`,
        );
        throw new ForbiddenException(
          'Access to the requested document or folder is restricted for your account. Please contact an administrator to request access.',
        );
      }

      const serializedActiveScope: IActiveScope = {
        type: active.type,
        id: active.id,
        name: active.name,
        updatedAt: active.updatedAt instanceof Date ? active.updatedAt.toISOString() : (active.updatedAt as any)?.toString?.() || new Date().toISOString(),
      };

      // 4. Topic relevance check: Is the user asking a clearly unrelated question?
      if (isClearlyUnrelatedQuestion(content)) {
        this.logger.log(
          `[ACTIVE_SCOPE] conversationId=${conversationId} previousScope=${active.name} explicitMention=none resolvedScope=none (unrelated topic) resolutionSource=none permissionCheck=skipped`,
        );
        return {
          explicitMentionedIds: [],
          effectiveResourceIds: [],
          activeScope: serializedActiveScope,
          resolutionSource: 'none',
        };
      }

      // Follow-up / contextual inquiry on active scope
      this.logger.log(
        `[ACTIVE_SCOPE] conversationId=${conversationId} previousScope=${active.name} explicitMention=none resolvedScope=${active.name} resolutionSource=active_scope permissionCheck=passed`,
      );

      return {
        explicitMentionedIds: [],
        effectiveResourceIds: validAccessibleResourceIds,
        activeScope: serializedActiveScope,
        resolutionSource: 'active_scope',
      };
    }

    // ==========================================
    // CASE 3: NO EXPLICIT MENTION & NO ACTIVE SCOPE
    // ==========================================
    if (conv.attachedResourceIds && conv.attachedResourceIds.length > 0) {
      const validated = await this.ownershipService.validateUserResources(userId, conv.attachedResourceIds);
      const validAccessibleResourceIds = Array.from(
        new Set([...validated.validDocumentIds, ...validated.validDatasetIds]),
      );
      return {
        explicitMentionedIds: [],
        effectiveResourceIds: validAccessibleResourceIds,
        activeScope: null,
        resolutionSource: 'none',
      };
    }

    return {
      explicitMentionedIds: [],
      effectiveResourceIds: [],
      activeScope: null,
      resolutionSource: 'none',
    };
  }

  async sendMessage(
    userId: string,
    dto: SendMessageDto,
    userRole?: string,
  ): Promise<ISendMessageResponse> {
    const { conversationId, content, referencedResourceIds = [], temporary = false } = dto;
    const isTemp = temporary === true || (typeof conversationId === 'string' && conversationId.startsWith('temp-'));
    const sessionKey = conversationId || ('temp-session-' + userId);

    let conv: any;

    if (isTemp) {
      this.logger.log(`[CHAT] temporary=true conversationId=${conversationId || 'none'} skipping persistent conversation lookup`);
      this.logger.log(`[CHAT] skipping message persistence`);
      conv = {
        _id: conversationId || ('temp-session-' + Date.now()),
        title: 'Temporary Chat',
        userId,
        collectionId: null,
        attachedResourceIds: [],
        activeScope: null,
        pinned: false,
        archived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    } else {
      if (!conversationId || !Types.ObjectId.isValid(conversationId)) {
        throw new NotFoundException('Conversation not found');
      }

      conv = await this.conversationModel.findById(conversationId);
      if (!conv) {
        throw new NotFoundException('Conversation not found or not accessible');
      }

      if (conv.type === 'direct') {
        const isParticipant = conv.participants && conv.participants.some((p: any) => p.toString() === userId);
        if (!isParticipant) {
          throw new ForbiddenException('You do not have access to this direct conversation.');
        }
      } else {
        const isOwner = conv.userId.toString() === userId;
        if (!isOwner) {
          const share = await this.conversationShareModel.findOne({
            conversationId: new Types.ObjectId(conversationId),
            sharedWithUserId: new Types.ObjectId(userId),
          });
          if (!share) {
            throw new NotFoundException('Conversation not found or not accessible');
          }
          if (share.permission === 'view') {
            throw new ForbiddenException('You have read-only access to this conversation.');
          }
        }
      }
    }

    // Direct Conversation check for AI Invocation
    const isAiInvocation = dto.mentions?.some((m: any) => m.type === 'ai') || /@Syntra\b/i.test(content) || /@AI\b/i.test(content);

    if (conv && conv.type === 'direct' && !isAiInvocation) {
      // Pure direct message between two organization members without AI invocation
      const authorUser: any = await this.userModel.findById(userId).select('firstName lastName email role').exec();
      const userMsgDoc = new this.messageModel({
        conversationId: new Types.ObjectId(conversationId),
        userId: new Types.ObjectId(userId),
        role: MessageRole.USER,
        content,
        mentions: dto.mentions || [],
        downloadableFile: dto.downloadableFile,
        replyToMessageId: dto.replyToMessageId,
        replyTo: dto.replyTo,
      });
      const savedUserMsg = await userMsgDoc.save();

      const partnerId = conv.participants.find((p: any) => p.toString() !== userId)?.toString();
      if (!conv.unreadCounts) conv.unreadCounts = new Map();
      const currentUnread = (conv.unreadCounts as any)?.get?.(partnerId) ?? (conv.unreadCounts as any)?.[partnerId] ?? 0;
      if (conv.unreadCounts.set) {
        conv.unreadCounts.set(partnerId, currentUnread + 1);
      } else {
        (conv.unreadCounts as any)[partnerId] = currentUnread + 1;
      }

      const senderName = authorUser ? `${authorUser.firstName} ${authorUser.lastName}` : 'User';
      conv.lastMessage = {
        content,
        senderId: new Types.ObjectId(userId),
        senderName,
        createdAt: new Date(),
        role: MessageRole.USER,
        isAi: false,
      };
      conv.lastMessageAt = new Date();
      conv.markModified('unreadCounts');
      conv.markModified('lastMessage');
      await conv.save();

      const userMsgDto = this.toIMessage(savedUserMsg, authorUser);
      const participantIds = conv.participants ? conv.participants.map((p: any) => p.toString()) : [userId, partnerId].filter(Boolean);
      this.messagesEventsService.broadcastNewMessage(userMsgDto, participantIds);

      if (partnerId) {
        this.notificationsService.createNotification({
          userId: partnerId,
          senderId: userId,
          type: 'direct_message',
          title: `Message from ${senderName}`,
          message: content.slice(0, 100),
          resourceType: 'conversation',
          resourceId: conversationId,
        }).catch((err) => console.error('Notification error:', err));
      }

      return {
        userMessage: userMsgDto,
      };
    }

    // 2. Concurrency Check (Max 2 active chats generating simultaneously per user)
    const userActive = this.activeGenerationsByUser.get(userId) || new Set<string>();

    if (userActive.has(sessionKey)) {
      throw new BadRequestException(
        'A message is already being generated in this chat. Please wait for it to complete.',
      );
    }

    if (userActive.size >= MessagesService.MAX_CONCURRENT_GENERATIONS) {
      throw new HttpException(
        'You have reached the maximum limit of 2 concurrent active chat generations. Please wait for one of your ongoing chats to complete before starting another.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Register active generation
    userActive.add(sessionKey);
    this.activeGenerationsByUser.set(userId, userActive);

    try {
      // 3. Resolve Active Scope and Resource IDs
      const scopeData = await this.resolveScopeAndResources(userId, conv, content, referencedResourceIds);

      // 4. Concurrently run independent operations: Save User Msg, Fetch Past History, and Fetch Shared Memory
      const userMsgPromise = !isTemp
        ? new this.messageModel({
            conversationId: new Types.ObjectId(conversationId),
            userId: new Types.ObjectId(userId),
            role: MessageRole.USER,
            content,
            referencedResourceIds: scopeData.explicitMentionedIds,
            mentions: dto.mentions || [],
            downloadableFile: dto.downloadableFile,
            replyToMessageId: dto.replyToMessageId,
            replyTo: dto.replyTo,
          }).save()
        : Promise.resolve({
            _id: 'temp-msg-user-' + Date.now(),
            conversationId,
            userId,
            role: MessageRole.USER,
            content,
            referencedResourceIds: scopeData.explicitMentionedIds,
            downloadableFile: dto.downloadableFile,
            replyToMessageId: dto.replyToMessageId,
            replyTo: dto.replyTo,
            createdAt: new Date(),
          });

      const historyPromise = !isTemp
        ? (() => {
            let q: any = this.messageModel
              .find({
                conversationId: new Types.ObjectId(conversationId),
              })
              .sort({ createdAt: -1 })
              .limit(50);
            if (typeof q?.populate === 'function') {
              q = q.populate('userId', 'firstName lastName');
            }
            return q.exec();
          })()
        : Promise.resolve([]);

      const sharedMemoryPromise = conv.collectionId
        ? this.collectionsService.getSharedMemory(userId, conv.collectionId.toString())
        : Promise.resolve('');

      const validConvAttachedPromise = conv.attachedResourceIds && conv.attachedResourceIds.length > 0
        ? this.ownershipService.validateUserResources(userId, conv.attachedResourceIds)
        : Promise.resolve({ validDocumentIds: [], validDatasetIds: [] });

      const authorUserPromise = !isTemp
        ? this.userModel.findById(userId).select('firstName lastName email role').exec()
        : Promise.resolve(null);

      const participantIdsPromise = !isTemp
        ? this.getConversationParticipantIds(conv)
        : Promise.resolve([] as string[]);

      const [savedUserMsg, pastMessages, sharedMemory, validatedConv, authorUser, participantIds] = await Promise.all([
        userMsgPromise,
        historyPromise,
        sharedMemoryPromise,
        validConvAttachedPromise,
        authorUserPromise,
        participantIdsPromise,
      ]);

      const userMsgDto: IMessage = !isTemp ? this.toIMessage(savedUserMsg as MessageEntityDocument, authorUser) : {
        id: (savedUserMsg as any)._id.toString(),
        conversationId,
        userId,
        role: MessageRole.USER,
        content,
        referencedResourceIds: scopeData.explicitMentionedIds,
        citations: [],
        createdAt: (savedUserMsg as any).createdAt instanceof Date ? (savedUserMsg as any).createdAt.toISOString() : new Date().toISOString(),
      };

      if (!isTemp && participantIds.length > 0) {
        this.messagesEventsService.broadcastNewMessage(userMsgDto, participantIds);
      }

      // Check for ungrounded / unresolved operational intent
      const unresolvedCheck = detectUnresolvedTargetOperation(content, scopeData.effectiveResourceIds, scopeData.activeScope);
      if (unresolvedCheck.isUnresolved && unresolvedCheck.clarificationAnswer) {
        let savedAssistantMsg: any;
        if (!isTemp) {
          const assistantMsgDoc = new this.messageModel({
            conversationId: new Types.ObjectId(conversationId),
            userId: new Types.ObjectId(userId),
            role: MessageRole.ASSISTANT,
            content: unresolvedCheck.clarificationAnswer,
            referencedResourceIds: [],
            citations: [],
          });
          savedAssistantMsg = await assistantMsgDoc.save();

          const updatePayload: any = { lastMessageAt: new Date() };
          if (scopeData.updatedActiveScopePayload !== undefined) {
            updatePayload.activeScope = scopeData.updatedActiveScopePayload;
          }

          const updatedConv = await this.conversationModel.findByIdAndUpdate(
            conversationId,
            { $set: updatePayload },
            { new: true },
          );

          const assistantMsgDto = this.toIMessage(savedAssistantMsg as MessageEntityDocument);
          if (participantIds.length > 0) {
            this.messagesEventsService.broadcastNewMessage(assistantMsgDto, participantIds);
          }

          return {
            userMessage: userMsgDto,
            assistantMessage: assistantMsgDto,
            conversation: updatedConv ? {
              id: updatedConv._id.toString(),
              title: updatedConv.title,
              userId: updatedConv.userId.toString(),
              collectionId: updatedConv.collectionId ? updatedConv.collectionId.toString() : null,
              attachedResourceIds: updatedConv.attachedResourceIds,
              pinned: updatedConv.pinned,
              archived: updatedConv.archived,
              activeScope: updatedConv.activeScope ? {
                type: updatedConv.activeScope.type,
                id: updatedConv.activeScope.id,
                name: updatedConv.activeScope.name,
                updatedAt: updatedConv.activeScope.updatedAt instanceof Date ? updatedConv.activeScope.updatedAt.toISOString() : (updatedConv.activeScope.updatedAt as any)?.toString?.(),
              } : undefined,
              createdAt: updatedConv.createdAt.toISOString(),
              updatedAt: updatedConv.updatedAt.toISOString(),
            } : undefined,
          };
        } else {
          return {
            userMessage: {
              id: (savedUserMsg as any)._id.toString(),
              conversationId,
              userId,
              role: MessageRole.USER,
              content,
              referencedResourceIds: scopeData.explicitMentionedIds,
              citations: [],
              createdAt: (savedUserMsg as any).createdAt instanceof Date ? (savedUserMsg as any).createdAt.toISOString() : new Date().toISOString(),
            },
            assistantMessage: {
              id: 'temp-msg-asst-' + Date.now(),
              conversationId,
              userId,
              role: MessageRole.ASSISTANT,
              content: unresolvedCheck.clarificationAnswer,
              referencedResourceIds: [],
              citations: [],
              createdAt: new Date().toISOString(),
            },
            conversation: {
              id: conversationId,
              title: 'Temporary Chat',
              userId,
              collectionId: null,
              attachedResourceIds: [],
              pinned: false,
              archived: false,
              activeScope: scopeData.activeScope || undefined,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          };
        }
      }

      // 5. Combine validated attached resources and scope resources
      const validConvAttachedIds = [
        ...validatedConv.validDocumentIds,
        ...validatedConv.validDatasetIds,
      ];

      const combinedResourceIds = Array.from(
        new Set([...validConvAttachedIds, ...scopeData.effectiveResourceIds]),
      );

      // 6. Format previous conversation history (excluding currently written user message if returned)
      const history = pastMessages
        .filter((m: any) => m._id.toString() !== savedUserMsg._id.toString())
        .reverse()
        .map((m: any) => {
          let prefix = '';
          if (conv.type === 'direct' && m.role === 'user') {
            const senderName = m.userId?.firstName
              ? `${m.userId.firstName} ${m.userId.lastName || ''}`.trim()
              : (m.author?.firstName ? `${m.author.firstName} ${m.author.lastName || ''}`.trim() : '');
            if (senderName) {
              prefix = `${senderName}: `;
            }
          }
          return {
            role: m.role as 'user' | 'assistant' | 'system',
            content: prefix ? `${prefix}${m.content}` : m.content,
          };
        });

      // 7. Attach quoted reply context if user is replying to a specific message
      let effectiveAiMessage = content;
      if (dto.replyTo) {
        const quotedSender = dto.replyTo.senderName || 'Colleague';
        const quotedText = dto.replyTo.content || dto.replyTo.fileName || '';
        const cleanPrompt = content.replace(/@Syntra\b/gi, '').replace(/@AI\b/gi, '').trim();
        if (cleanPrompt) {
          effectiveAiMessage = `[Replying to message from ${quotedSender}: "${quotedText}"]\n\n${content}`;
        } else {
          effectiveAiMessage = `[Replying to message from ${quotedSender}: "${quotedText}"]\n\nPlease help answer or address this message.`;
        }
      }

      // 8. Call AI Service via AiGateway with structured activeScope
      const isFileReq = isPdfDiscoveryRequest(content);
      let authoritativeDownloadableFile: IDownloadableFile | undefined;
      let fileRes: any = null;

      if (isFileReq) {
        fileRes = await this.documentsService.resolvePdfRequest(userId, content, scopeData.activeScope, history);
        if (fileRes.matchType === 'exact' && fileRes.found && fileRes.document && fileRes.canDownload) {
          authoritativeDownloadableFile = {
            documentId: fileRes.document.id,
            fileName: fileRes.document.originalName,
            fileSize: fileRes.document.fileSize,
            mimeType: fileRes.document.mimeType || 'application/pdf',
            folder: fileRes.document.folder,
          };
        }
      }

      const aiResponse = await this.aiGatewayService.chat({
        userId,
        userRole,
        conversationId,
        message: effectiveAiMessage,
        resourceIds: combinedResourceIds,
        activeScope: scopeData.activeScope,
        sharedMemory: sharedMemory || undefined,
        history,
      });

      // Authoritative security check: Validate any AI-suggested downloadableFile
      if (aiResponse.downloadableFile?.documentId) {
        const canDl = await this.documentsService.canUserDownloadDocument(userId, aiResponse.downloadableFile.documentId);
        if (canDl.canDownload) {
          authoritativeDownloadableFile = aiResponse.downloadableFile;
        } else {
          authoritativeDownloadableFile = undefined;
        }
      }

      // Enforce clean, natural, accurate response wording for file requests
      if (isFileReq && fileRes) {
        if (fileRes.matchType === 'exact') {
          if (!fileRes.canDownload) {
            authoritativeDownloadableFile = undefined;
            if (fileRes.reason === 'ACCESS_DENIED') {
              aiResponse.answer = `You do not have access to this document. Please request access to view or download it.`;
            } else {
              aiResponse.answer = `This file can't be downloaded.`;
            }
          } else if (aiResponse.intent === AgentIntent.FILE_REQUEST || !aiResponse.answer || aiResponse.answer.toLowerCase().includes("couldn't find") || aiResponse.answer.toLowerCase().includes("cannot find")) {
            aiResponse.answer = `Here is the file.`;
          }
        } else if (fileRes.matchType === 'ambiguous' && fileRes.candidates && fileRes.candidates.length > 0) {
          authoritativeDownloadableFile = undefined;
          const candidateList = fileRes.candidates.map((c: any) => `- ${c.originalName}${c.folder ? ` (${c.folder})` : ''}`).join('\n');
          aiResponse.answer = `I found a few matching files. Which one do you want?\n\n${candidateList}`;
        } else if (fileRes.matchType === 'alternative' && fileRes.alternativeDocument) {
          authoritativeDownloadableFile = undefined;
          aiResponse.answer = `I couldn't find that exact file, but I found '${fileRes.alternativeDocument.originalName}'${fileRes.alternativeDocument.folder ? ` in the ${fileRes.alternativeDocument.folder} folder` : ''}. Is that the file you mean?`;
        } else if (fileRes.matchType === 'none') {
          authoritativeDownloadableFile = undefined;
          if (!aiResponse.answer || aiResponse.intent === AgentIntent.FILE_REQUEST || aiResponse.answer.toLowerCase().includes("couldn't find") || aiResponse.answer.toLowerCase().includes("cannot find")) {
            aiResponse.answer = `Sorry, I couldn't find that file.`;
          }
        }
      }

      // 9. Save Assistant Message (Skip DB save for temporary chats)
      let savedAssistantMsg: any;
      let updatedConv: any = null;

      if (!isTemp) {
        const assistantMsgDoc = new this.messageModel({
          conversationId: new Types.ObjectId(conversationId),
          userId: new Types.ObjectId(userId),
          role: MessageRole.ASSISTANT,
          content: aiResponse.answer || 'No response generated.',
          referencedResourceIds: combinedResourceIds,
          citations: aiResponse.citations || [],
          generatedChart: aiResponse.generatedChart,
          generatedCharts: (aiResponse as any).generatedCharts || (aiResponse.generatedChart ? [aiResponse.generatedChart] : []),
          generatedTable: aiResponse.generatedTable,
          pythonCode: aiResponse.pythonCode,
          executionOutput: aiResponse.executionOutput,
          downloadableFile: authoritativeDownloadableFile,
        });
        savedAssistantMsg = await assistantMsgDoc.save();

        // 10. Update Collection Shared Memory if collection assigned
        if (conv.collectionId && aiResponse.answer) {
          const summaryCandidate = `Chat "${conv.title}": Q: "${content.slice(0, 120)}" -> A: ${aiResponse.answer.slice(0, 250).replace(/[\r\n]+/g, ' ')}`;
          this.collectionsService.updateSharedMemory(userId, conv.collectionId.toString(), summaryCandidate).catch((err) => {
            console.error('Failed to update collection shared memory:', err);
          });
        }

        // 11. Update conversation timestamp, activeScope, and title
        const updatePayload: any = { lastMessageAt: new Date() };
        if (scopeData.updatedActiveScopePayload !== undefined) {
          updatePayload.activeScope = scopeData.updatedActiveScopePayload;
        }

        if (conv.type === 'direct') {
          updatePayload.lastMessage = {
            content: aiResponse.answer || 'Syntra AI response',
            senderId: new Types.ObjectId(userId),
            senderName: 'Syntra AI',
            createdAt: new Date(),
            role: MessageRole.ASSISTANT,
            isAi: true,
          };
        } else if (pastMessages.length === 0 || conv.title === 'New Conversation' || !conv.title || conv.title.startsWith('New Conversation')) {
          try {
            const title = await this.aiGatewayService.generateTitle(content);
            if (title && title !== 'New Conversation') {
              updatePayload.title = title;
            }
          } catch (e) {
            console.error('Auto-naming failed:', e);
          }
        }

        updatedConv = await this.conversationModel.findByIdAndUpdate(
          conversationId,
          { $set: updatePayload },
          { new: true },
        );
      } else {
        savedAssistantMsg = {
          _id: 'temp-msg-asst-' + Date.now(),
          conversationId,
          userId,
          role: MessageRole.ASSISTANT,
          content: aiResponse.answer || 'No response generated.',
          referencedResourceIds: combinedResourceIds,
          citations: aiResponse.citations || [],
          generatedChart: aiResponse.generatedChart,
          generatedCharts: (aiResponse as any).generatedCharts || (aiResponse.generatedChart ? [aiResponse.generatedChart] : []),
          generatedTable: aiResponse.generatedTable,
          pythonCode: aiResponse.pythonCode,
          executionOutput: aiResponse.executionOutput,
          downloadableFile: authoritativeDownloadableFile,
          createdAt: new Date(),
        };
      }

      const assistantMsgDto: IMessage = !isTemp ? this.toIMessage(savedAssistantMsg as MessageEntityDocument) : {
        id: (savedAssistantMsg as any)._id.toString(),
        conversationId,
        userId,
        role: MessageRole.ASSISTANT,
        content: savedAssistantMsg.content,
        referencedResourceIds: savedAssistantMsg.referencedResourceIds,
        citations: savedAssistantMsg.citations,
        generatedChart: savedAssistantMsg.generatedChart,
        generatedCharts: savedAssistantMsg.generatedCharts,
        generatedTable: savedAssistantMsg.generatedTable,
        pythonCode: savedAssistantMsg.pythonCode,
        executionOutput: savedAssistantMsg.executionOutput,
        downloadableFile: savedAssistantMsg.downloadableFile,
        createdAt: savedAssistantMsg.createdAt.toISOString(),
      };

      if (!isTemp && participantIds.length > 0) {
        this.messagesEventsService.broadcastNewMessage(assistantMsgDto, participantIds);
      }

      return {
        userMessage: userMsgDto,
        assistantMessage: assistantMsgDto,
        conversation: !isTemp ? (updatedConv ? {
          id: updatedConv._id.toString(),
          title: updatedConv.title,
          userId: updatedConv.userId.toString(),
          collectionId: updatedConv.collectionId ? updatedConv.collectionId.toString() : null,
          attachedResourceIds: updatedConv.attachedResourceIds,
          pinned: updatedConv.pinned,
          archived: updatedConv.archived,
          activeScope: updatedConv.activeScope ? {
            type: updatedConv.activeScope.type,
            id: updatedConv.activeScope.id,
            name: updatedConv.activeScope.name,
            updatedAt: updatedConv.activeScope.updatedAt instanceof Date ? updatedConv.activeScope.updatedAt.toISOString() : (updatedConv.activeScope.updatedAt as any)?.toString?.(),
          } : undefined,
          createdAt: updatedConv.createdAt.toISOString(),
          updatedAt: updatedConv.updatedAt.toISOString(),
        } : undefined) : {
          id: conversationId,
          title: 'Temporary Chat',
          userId,
          collectionId: null,
          attachedResourceIds: [],
          pinned: false,
          archived: false,
          activeScope: scopeData.activeScope || undefined,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      };
    } finally {
      userActive.delete(sessionKey);
      if (userActive.size === 0) {
        this.activeGenerationsByUser.delete(userId);
      }
    }
  }

  async streamMessage(
    userId: string,
    dto: SendMessageDto,
    res: any,
    userRole?: string,
  ): Promise<void> {
    const { conversationId, content, referencedResourceIds = [], temporary = false } = dto;
    const isTemp = temporary === true || (typeof conversationId === 'string' && conversationId.startsWith('temp-'));
    const sessionKey = conversationId || ('temp-session-' + userId);

    let conv: any;

    if (isTemp) {
      this.logger.log(`[CHAT] temporary=true conversationId=${conversationId || 'none'} skipping persistent conversation lookup`);
      this.logger.log(`[CHAT] skipping message persistence`);
      conv = {
        _id: conversationId || ('temp-session-' + Date.now()),
        title: 'Temporary Chat',
        userId,
        collectionId: null,
        attachedResourceIds: [],
        activeScope: null,
        pinned: false,
        archived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    } else {
      if (!conversationId || !Types.ObjectId.isValid(conversationId)) {
        throw new NotFoundException('Conversation not found');
      }

      conv = await this.conversationModel.findById(conversationId);
      if (!conv) {
        throw new NotFoundException('Conversation not found or not accessible');
      }

      if (conv.type === 'direct') {
        const isParticipant = conv.participants && conv.participants.some((p: any) => p.toString() === userId);
        if (!isParticipant) {
          throw new ForbiddenException('You do not have access to this direct conversation.');
        }
      } else {
        const isOwner = conv.userId.toString() === userId;
        if (!isOwner) {
          const share = await this.conversationShareModel.findOne({
            conversationId: new Types.ObjectId(conversationId),
            sharedWithUserId: new Types.ObjectId(userId),
          });
          if (!share) {
            throw new NotFoundException('Conversation not found or not accessible');
          }
          if (share.permission === 'view') {
            throw new ForbiddenException('You have read-only access to this conversation.');
          }
        }
      }
    }

    // Direct Conversation check for AI Invocation
    const isAiInvocation = dto.mentions?.some((m: any) => m.type === 'ai') || /@Syntra\b/i.test(content) || /@AI\b/i.test(content);

    if (conv && conv.type === 'direct' && !isAiInvocation) {
      // Pure direct message between two organization members without AI invocation
      const authorUser: any = await this.userModel.findById(userId).select('firstName lastName email role').exec();
      const userMsgDoc = new this.messageModel({
        conversationId: new Types.ObjectId(conversationId),
        userId: new Types.ObjectId(userId),
        role: MessageRole.USER,
        content,
        mentions: dto.mentions || [],
      });
      const savedUserMsg = await userMsgDoc.save();

      const partnerId = conv.participants.find((p: any) => p.toString() !== userId)?.toString();
      if (!conv.unreadCounts) conv.unreadCounts = new Map();
      const currentUnread = (conv.unreadCounts as any)?.get?.(partnerId) ?? (conv.unreadCounts as any)?.[partnerId] ?? 0;
      if (conv.unreadCounts.set) {
        conv.unreadCounts.set(partnerId, currentUnread + 1);
      } else {
        (conv.unreadCounts as any)[partnerId] = currentUnread + 1;
      }

      const senderName = authorUser ? `${authorUser.firstName} ${authorUser.lastName}` : 'User';
      conv.lastMessage = {
        content,
        senderId: new Types.ObjectId(userId),
        senderName,
        createdAt: new Date(),
        role: MessageRole.USER,
        isAi: false,
      };
      conv.lastMessageAt = new Date();
      conv.markModified('unreadCounts');
      conv.markModified('lastMessage');
      await conv.save();

      const userMsgDto = this.toIMessage(savedUserMsg, authorUser);
      const participantIds = conv.participants ? conv.participants.map((p: any) => p.toString()) : [userId, partnerId].filter(Boolean);
      this.messagesEventsService.broadcastNewMessage(userMsgDto, participantIds);

      if (partnerId) {
        this.notificationsService.createNotification({
          userId: partnerId,
          senderId: userId,
          type: 'direct_message',
          title: `Message from ${senderName}`,
          message: content.slice(0, 100),
          resourceType: 'conversation',
          resourceId: conversationId,
        }).catch((err) => console.error('Notification error:', err));
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      res.write(`event: user_message\ndata: ${JSON.stringify(userMsgDto)}\n\n`);
      res.write(`event: done\ndata: ${JSON.stringify({ conversationId })}\n\n`);
      res.end();
      return;
    }

    // 2. Concurrency Check (Max 2 active chats generating simultaneously per user)
    const userActive = this.activeGenerationsByUser.get(userId) || new Set<string>();

    if (userActive.has(sessionKey)) {
      throw new BadRequestException(
        'A message is already being generated in this chat. Please wait for it to complete.',
      );
    }

    if (userActive.size >= MessagesService.MAX_CONCURRENT_GENERATIONS) {
      throw new HttpException(
        'You have reached the maximum limit of 2 concurrent active chat generations. Please wait for one of your ongoing chats to complete before starting another.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Register active generation
    userActive.add(sessionKey);
    this.activeGenerationsByUser.set(userId, userActive);

    // Prepare SSE response headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    try {
      // 3. Resolve Active Scope and Resource IDs
      const scopeData = await this.resolveScopeAndResources(userId, conv, content, referencedResourceIds);

      // 4. Handle User Message (Save to DB only for persistent chats)
      let savedUserMsg: any;
      let userMsgDto: IMessage;
      let participantIds: string[] = [];

      if (!isTemp) {
        const userMsgDoc = new this.messageModel({
          conversationId: new Types.ObjectId(conversationId),
          userId: new Types.ObjectId(userId),
          role: MessageRole.USER,
          content,
          referencedResourceIds: scopeData.explicitMentionedIds,
          mentions: dto.mentions || [],
          downloadableFile: dto.downloadableFile,
          replyToMessageId: dto.replyToMessageId,
          replyTo: dto.replyTo,
        });
        savedUserMsg = await userMsgDoc.save();
        const authorUser: any = await this.userModel.findById(userId).select('firstName lastName email role').exec();
        userMsgDto = this.toIMessage(savedUserMsg, authorUser);
        participantIds = await this.getConversationParticipantIds(conv);
        if (participantIds.length > 0) {
          this.messagesEventsService.broadcastNewMessage(userMsgDto, participantIds);
        }
        res.write(`event: user_message\ndata: ${JSON.stringify(userMsgDto)}\n\n`);
      } else {
        savedUserMsg = {
          id: 'temp-msg-user-' + Date.now(),
          conversationId,
          userId,
          role: MessageRole.USER,
          content,
          referencedResourceIds: scopeData.explicitMentionedIds,
          citations: [],
          downloadableFile: dto.downloadableFile,
          replyToMessageId: dto.replyToMessageId,
          replyTo: dto.replyTo,
          createdAt: new Date().toISOString(),
        };
        userMsgDto = savedUserMsg;
        res.write(`event: user_message\ndata: ${JSON.stringify(savedUserMsg)}\n\n`);
      }

      // Check for ungrounded / unresolved operational intent
      const unresolvedCheck = detectUnresolvedTargetOperation(content, scopeData.effectiveResourceIds, scopeData.activeScope);
      if (unresolvedCheck.isUnresolved && unresolvedCheck.clarificationAnswer) {
        const words = unresolvedCheck.clarificationAnswer.split(' ');
        for (let i = 0; i < words.length; i++) {
          const chunk = i === words.length - 1 ? words[i] : words[i] + ' ';
          res.write(`event: token\ndata: ${JSON.stringify({ token: chunk })}\n\n`);
          await new Promise((r) => setTimeout(r, 15));
        }

        res.write(`event: metadata\ndata: ${JSON.stringify({ citations: [], intent: 'clarification' })}\n\n`);
        res.write(`event: done\ndata: {}\n\n`);

        if (!isTemp) {
          const assistantMsgDoc = new this.messageModel({
            conversationId: new Types.ObjectId(conversationId),
            userId: new Types.ObjectId(userId),
            role: MessageRole.ASSISTANT,
            content: unresolvedCheck.clarificationAnswer,
            referencedResourceIds: [],
            citations: [],
          });
          const savedAsst = await assistantMsgDoc.save();

          const updatePayload: any = { lastMessageAt: new Date() };
          if (scopeData.updatedActiveScopePayload !== undefined) {
            updatePayload.activeScope = scopeData.updatedActiveScopePayload;
          }
          await this.conversationModel.findByIdAndUpdate(conversationId, { $set: updatePayload });

          const asstDto = this.toIMessage(savedAsst);
          if (participantIds.length > 0) {
            this.messagesEventsService.broadcastNewMessage(asstDto, participantIds);
          }
        }
        res.end();
        return;
      }

      // 5. Validate and filter ANY legacy attached resources from the conversation
      const validConvAttachedIds: string[] = [];
      if (conv.attachedResourceIds && conv.attachedResourceIds.length > 0) {
        const validated = await this.ownershipService.validateUserResources(userId, conv.attachedResourceIds);
        validConvAttachedIds.push(...validated.validDocumentIds, ...validated.validDatasetIds);
      }

      const combinedResourceIds = Array.from(
        new Set([...validConvAttachedIds, ...scopeData.effectiveResourceIds]),
      );

      // 6. Fetch previous conversation history (up to 50 recent messages in chronological order)
      let history: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];
      let pastMessages: any[] = [];
      if (!isTemp) {
        let streamHistoryQuery: any = this.messageModel
          .find({
            conversationId: new Types.ObjectId(conversationId),
            _id: { $ne: savedUserMsg._id },
          })
          .sort({ createdAt: -1 })
          .limit(50);
        if (typeof streamHistoryQuery?.populate === 'function') {
          streamHistoryQuery = streamHistoryQuery.populate('userId', 'firstName lastName');
        }
        pastMessages = await streamHistoryQuery.exec();

        history = pastMessages.reverse().map((m) => {
          let prefix = '';
          if (conv.type === 'direct' && m.role === 'user') {
            const senderName = m.userId?.firstName
              ? `${m.userId.firstName} ${m.userId.lastName || ''}`.trim()
              : (m.author?.firstName ? `${m.author.firstName} ${m.author.lastName || ''}`.trim() : '');
            if (senderName) {
              prefix = `${senderName}: `;
            }
          }
          return {
            role: m.role as 'user' | 'assistant' | 'system',
            content: prefix ? `${prefix}${m.content}` : m.content,
          };
        });
      }

      // 7. Attach quoted reply context if user is replying to a specific message
      let effectiveAiMessage = content;
      if (dto.replyTo) {
        const quotedSender = dto.replyTo.senderName || 'Colleague';
        const quotedText = dto.replyTo.content || dto.replyTo.fileName || '';
        const cleanPrompt = content.replace(/@Syntra\b/gi, '').replace(/@AI\b/gi, '').trim();
        if (cleanPrompt) {
          effectiveAiMessage = `[Replying to message from ${quotedSender}: "${quotedText}"]\n\n${content}`;
        } else {
          effectiveAiMessage = `[Replying to message from ${quotedSender}: "${quotedText}"]\n\nPlease help answer or address this message.`;
        }
      }

      // 8. Retrieve Collection Shared Memory if conversation is assigned to a collection
      let sharedMemory = '';
      if (conv.collectionId) {
        sharedMemory = await this.collectionsService.getSharedMemory(userId, conv.collectionId.toString());
      }

      let fullAnswer = '';
      let metadata: any = {};

      const isFileReq = isPdfDiscoveryRequest(content);
      let authoritativeDownloadableFile: IDownloadableFile | undefined;
      let fileRes: any = null;

      if (isFileReq) {
        fileRes = await this.documentsService.resolvePdfRequest(userId, content, scopeData.activeScope, history);
        if (fileRes.matchType === 'exact' && fileRes.found && fileRes.document && fileRes.canDownload) {
          authoritativeDownloadableFile = {
            documentId: fileRes.document.id,
            fileName: fileRes.document.originalName,
            fileSize: fileRes.document.fileSize,
            mimeType: fileRes.document.mimeType || 'application/pdf',
            folder: fileRes.document.folder,
          };
        }
      }

      try {
        const stream = await this.aiGatewayService.streamChat({
          userId,
          userRole,
          conversationId,
          message: effectiveAiMessage,
          resourceIds: combinedResourceIds,
          activeScope: scopeData.activeScope,
          sharedMemory: sharedMemory || undefined,
          history,
        });

        await new Promise<void>((resolve, reject) => {
          let buffer = '';

          stream.on('data', (chunk: Buffer) => {
            buffer += chunk.toString();
            const lines = buffer.split('\n\n');
            buffer = lines.pop() || '';

            for (const block of lines) {
              if (!block.trim()) continue;

              const eventMatch = block.match(/event:\s*(\w+)/);
              const dataMatch = block.match(/data:\s*(.+)/);
              if (eventMatch && dataMatch) {
                const eventType = eventMatch[1];
                try {
                  const parsed = JSON.parse(dataMatch[1]);
                  if (eventType === 'token' && parsed.token) {
                    fullAnswer += parsed.token;
                    res.write(`${block}\n\n`);
                  } else if (eventType === 'metadata') {
                    metadata = parsed;
                  } else {
                    res.write(`${block}\n\n`);
                  }
                } catch (e) {
                  res.write(`${block}\n\n`);
                }
              } else {
                res.write(`${block}\n\n`);
              }
            }
          });

          stream.on('end', () => resolve());
          stream.on('error', (err: any) => reject(err));
        });
      } catch (streamErr: any) {
        // Fallback: If AI microservice /chat/stream is not available or reloading, invoke standard chat and stream tokens progressively
        const chatRes = await this.aiGatewayService.chat({
          userId,
          conversationId,
          message: content,
          resourceIds: combinedResourceIds,
          activeScope: scopeData.activeScope,
          sharedMemory: sharedMemory || undefined,
          history,
        });

        fullAnswer = chatRes.answer || '';
        metadata = {
          citations: chatRes.citations || [],
          generatedChart: chatRes.generatedChart,
          generatedCharts: (chatRes as any).generatedCharts || (chatRes.generatedChart ? [chatRes.generatedChart] : []),
          generatedTable: chatRes.generatedTable,
          pythonCode: chatRes.pythonCode,
          executionOutput: chatRes.executionOutput,
          downloadableFile: chatRes.downloadableFile,
          intent: chatRes.intent || 'general_chat',
        };

        // Stream answer progressively to frontend
        const words = fullAnswer.split(' ');
        for (let i = 0; i < words.length; i++) {
          const chunk = i === words.length - 1 ? words[i] : words[i] + ' ';
          res.write(`event: token\ndata: ${JSON.stringify({ token: chunk })}\n\n`);
          await new Promise((r) => setTimeout(r, 15));
        }
      }

      // Security check on AI metadata for downloadableFile
      if (metadata.downloadableFile?.documentId) {
        const canDl = await this.documentsService.canUserDownloadDocument(userId, metadata.downloadableFile.documentId);
        if (canDl.canDownload) {
          authoritativeDownloadableFile = metadata.downloadableFile;
        } else {
          authoritativeDownloadableFile = undefined;
          delete metadata.downloadableFile;
        }
      }

      // Enforce clean, natural, accurate response wording for file requests
      if (isFileReq && fileRes) {
        if (fileRes.matchType === 'exact') {
          if (!fileRes.canDownload) {
            authoritativeDownloadableFile = undefined;
            delete metadata.downloadableFile;
            if (fileRes.reason === 'ACCESS_DENIED') {
              fullAnswer = `You do not have access to this document. Please request access to view or download it.`;
            } else {
              fullAnswer = `This file can't be downloaded.`;
            }
          } else if (metadata.intent === AgentIntent.FILE_REQUEST || !fullAnswer || fullAnswer.toLowerCase().includes("couldn't find") || fullAnswer.toLowerCase().includes("cannot find") || fullAnswer.toLowerCase().includes("file viewer panel")) {
            fullAnswer = `Here is the file.`;
          }
        } else if (fileRes.matchType === 'ambiguous' && fileRes.candidates && fileRes.candidates.length > 0) {
          authoritativeDownloadableFile = undefined;
          delete metadata.downloadableFile;
          const candidateList = fileRes.candidates.map((c: any) => `- ${c.originalName}${c.folder ? ` (${c.folder})` : ''}`).join('\n');
          fullAnswer = `I found a few matching files. Which one do you want?\n\n${candidateList}`;
        } else if (fileRes.matchType === 'alternative' && fileRes.alternativeDocument) {
          authoritativeDownloadableFile = undefined;
          delete metadata.downloadableFile;
          fullAnswer = `I couldn't find that exact file, but I found '${fileRes.alternativeDocument.originalName}'${fileRes.alternativeDocument.folder ? ` in the ${fileRes.alternativeDocument.folder} folder` : ''}. Is that the file you mean?`;
        } else if (fileRes.matchType === 'none') {
          authoritativeDownloadableFile = undefined;
          delete metadata.downloadableFile;
          if (!fullAnswer || metadata.intent === AgentIntent.FILE_REQUEST || fullAnswer.toLowerCase().includes("couldn't find") || fullAnswer.toLowerCase().includes("cannot find")) {
            fullAnswer = `Sorry, I couldn't find that file.`;
          }
        }
      }

      if (authoritativeDownloadableFile) {
        metadata.downloadableFile = authoritativeDownloadableFile;
      }
      res.write(`event: metadata\ndata: ${JSON.stringify(metadata)}\n\n`);

      // Save Assistant Message (Skip DB save for temporary chats)
      let savedAssistantMsg: any;
      let updatedConv: any = null;

      if (!isTemp) {
        const assistantMsgDoc = new this.messageModel({
          conversationId: new Types.ObjectId(conversationId),
          userId: new Types.ObjectId(userId),
          role: MessageRole.ASSISTANT,
          content: fullAnswer || 'No response generated.',
          referencedResourceIds: combinedResourceIds,
          citations: metadata.citations || [],
          generatedChart: metadata.generatedChart,
          generatedCharts: metadata.generatedCharts || (metadata.generatedChart ? [metadata.generatedChart] : []),
          generatedTable: metadata.generatedTable,
          pythonCode: metadata.pythonCode,
          executionOutput: metadata.executionOutput,
          downloadableFile: authoritativeDownloadableFile,
        });
        savedAssistantMsg = await assistantMsgDoc.save();
        const asstDto = this.toIMessage(savedAssistantMsg);
        if (participantIds.length > 0) {
          this.messagesEventsService.broadcastNewMessage(asstDto, participantIds);
        }

        // Update Collection Shared Memory if conversation belongs to a collection
        if (conv.collectionId && fullAnswer) {
          const summaryCandidate = `Chat "${conv.title}": Q: "${content.slice(0, 120)}" -> A: ${fullAnswer.slice(0, 250).replace(/[\r\n]+/g, ' ')}`;
          this.collectionsService.updateSharedMemory(userId, conv.collectionId.toString(), summaryCandidate).catch((err) => {
            console.error('Failed to update collection shared memory:', err);
          });
        }

        // Update conversation title and activeScope if needed
        const updatePayload: any = { lastMessageAt: new Date() };
        if (scopeData.updatedActiveScopePayload !== undefined) {
          updatePayload.activeScope = scopeData.updatedActiveScopePayload;
        }

        if (pastMessages.length === 0 || conv.title === 'New Conversation' || !conv.title || conv.title.startsWith('New Conversation')) {
          try {
            const title = await this.aiGatewayService.generateTitle(content);
            if (title && title !== 'New Conversation') {
              updatePayload.title = title;
            }
          } catch (e) {}
        }

        updatedConv = await this.conversationModel.findByIdAndUpdate(
          conversationId,
          { $set: updatePayload },
          { new: true },
        );
      } else {
        savedAssistantMsg = {
          _id: 'temp-msg-asst-' + Date.now(),
          conversationId,
          userId,
          role: MessageRole.ASSISTANT,
          content: fullAnswer || 'No response generated.',
          referencedResourceIds: combinedResourceIds,
          citations: metadata.citations || [],
          generatedChart: metadata.generatedChart,
          generatedCharts: metadata.generatedCharts || (metadata.generatedChart ? [metadata.generatedChart] : []),
          generatedTable: metadata.generatedTable,
          pythonCode: metadata.pythonCode,
          executionOutput: metadata.executionOutput,
          downloadableFile: authoritativeDownloadableFile,
          createdAt: new Date(),
        };
      }

      // Send completion message
      res.write(`event: completed_message\ndata: ${JSON.stringify({
        assistantMessage: !isTemp ? this.toIMessage(savedAssistantMsg) : {
          id: savedAssistantMsg._id,
          conversationId,
          userId,
          role: MessageRole.ASSISTANT,
          content: savedAssistantMsg.content,
          referencedResourceIds: savedAssistantMsg.referencedResourceIds,
          citations: savedAssistantMsg.citations,
          generatedChart: savedAssistantMsg.generatedChart,
          generatedCharts: savedAssistantMsg.generatedCharts,
          generatedTable: savedAssistantMsg.generatedTable,
          pythonCode: savedAssistantMsg.pythonCode,
          executionOutput: savedAssistantMsg.executionOutput,
          downloadableFile: savedAssistantMsg.downloadableFile,
          createdAt: savedAssistantMsg.createdAt.toISOString(),
        },
        conversation: !isTemp ? (updatedConv ? {
          id: updatedConv._id.toString(),
          title: updatedConv.title,
          userId: updatedConv.userId.toString(),
          collectionId: updatedConv.collectionId ? updatedConv.collectionId.toString() : null,
          attachedResourceIds: updatedConv.attachedResourceIds,
          pinned: updatedConv.pinned,
          archived: updatedConv.archived,
          activeScope: updatedConv.activeScope ? {
            type: updatedConv.activeScope.type,
            id: updatedConv.activeScope.id,
            name: updatedConv.activeScope.name,
            updatedAt: updatedConv.activeScope.updatedAt instanceof Date ? updatedConv.activeScope.updatedAt.toISOString() : (updatedConv.activeScope.updatedAt as any)?.toString?.(),
          } : undefined,
          createdAt: updatedConv.createdAt.toISOString(),
          updatedAt: updatedConv.updatedAt.toISOString(),
        } : undefined) : {
          id: conversationId,
          title: 'Temporary Chat',
          userId,
          collectionId: null,
          attachedResourceIds: [],
          pinned: false,
          archived: false,
          activeScope: scopeData.activeScope || undefined,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      })}\n\n`);

      res.end();
    } catch (err: any) {
      if (!res.headersSent) {
        throw err;
      }
      res.write(`event: error\ndata: ${JSON.stringify({ error: err.message || 'Processing failed' })}\n\n`);
      res.end();
    } finally {
      userActive.delete(sessionKey);
      if (userActive.size === 0) {
        this.activeGenerationsByUser.delete(userId);
      }
    }
  }

  async shareMessage(
    userId: string,
    messageId: string,
    dto: { userIds: string[] },
  ): Promise<IMessageShare[]> {
    if (!Types.ObjectId.isValid(messageId)) {
      throw new BadRequestException('Invalid message ID');
    }

    const message: any = await this.messageModel.findById(messageId).populate('userId', 'firstName lastName email').lean().exec();
    if (!message) {
      throw new NotFoundException('Message not found');
    }

    // Verify sender has access to this message (is message author, conversation owner, or conversation collaborator)
    const conv = await this.conversationModel.findById(message.conversationId).lean().exec();
    if (!conv) {
      throw new NotFoundException('Conversation not found');
    }

    const isAuthor = message.userId && (message.userId._id || message.userId).toString() === userId;
    const isConvOwner = conv.userId.toString() === userId;
    if (!isAuthor && !isConvOwner) {
      const share = await this.conversationShareModel.findOne({
        conversationId: conv._id,
        sharedWithUserId: new Types.ObjectId(userId),
      });
      if (!share) {
        throw new ForbiddenException('You do not have permission to share this message.');
      }
    }

    const sender = await this.userModel.findById(userId).lean().exec();
    const senderName = sender ? `${sender.firstName} ${sender.lastName}`.trim() : 'A colleague';

    const results: IMessageShare[] = [];

    for (const targetUserId of dto.userIds) {
      if (targetUserId === userId) continue;
      if (!Types.ObjectId.isValid(targetUserId)) continue;

      const targetObjId = new Types.ObjectId(targetUserId);
      const userObjId = new Types.ObjectId(userId);

      const shareDoc = await this.messageShareModel.findOneAndUpdate(
        {
          messageId: new Types.ObjectId(messageId),
          sharedWithUserId: targetObjId,
        },
        {
          $set: {
            conversationId: conv._id,
            ownerId: conv.userId,
            createdBy: userObjId,
          },
        },
        { upsert: true, new: true },
      );

      // Find or create 1:1 Direct Conversation between sender and recipient
      let directConv = await this.conversationModel.findOne({
        type: 'direct',
        participants: { $all: [userObjId, targetObjId] },
      });

      if (!directConv) {
        const targetUser = await this.userModel.findById(targetObjId).lean().exec();
        directConv = new this.conversationModel({
          userId: userObjId,
          type: 'direct',
          participants: [userObjId, targetObjId],
          title: targetUser ? `${targetUser.firstName} ${targetUser.lastName}` : 'Direct Message',
          attachedResourceIds: [],
          unreadCounts: new Map(),
        });
        await directConv.save();
      }

      const isAi = message.role === 'assistant';
      const senderHeader = isAi ? `Shared an AI insight:` : `Shared a message:`;
      const directMsgContent = isAi
        ? `${senderHeader}\n\n${message.content}`
        : message.content;

      const directMsg = new this.messageModel({
        conversationId: directConv._id,
        userId: userObjId,
        role: MessageRole.USER,
        content: directMsgContent,
        citations: message.citations || [],
        generatedCharts: message.generatedCharts || (message.generatedChart ? [message.generatedChart] : []),
        generatedChart: message.generatedChart || null,
        generatedTable: message.generatedTable || null,
        downloadableFile: message.downloadableFile || null,
        referencedResourceIds: message.referencedResourceIds || [],
      });
      await directMsg.save();

      // Update direct conversation lastMessage and unread count
      const currentUnread = (directConv.unreadCounts as any)?.get?.(targetUserId) ?? (directConv.unreadCounts as any)?.[targetUserId] ?? 0;
      if (directConv.unreadCounts instanceof Map) {
        directConv.unreadCounts.set(targetUserId, currentUnread + 1);
      } else {
        (directConv.unreadCounts as any)[targetUserId] = currentUnread + 1;
      }
      directConv.lastMessage = {
        content: directMsgContent.length > 80 ? directMsgContent.slice(0, 77) + '...' : directMsgContent,
        senderId: userObjId,
        senderName: senderName,
        createdAt: new Date(),
        role: 'user',
        isAi: isAi,
      };
      directConv.updatedAt = new Date();
      await directConv.save();

      // Create notification
      try {
        const preview = message.content ? (message.content.length > 60 ? message.content.slice(0, 57) + '...' : message.content) : 'a message';
        await this.notificationsService.createNotification({
          userId: targetUserId,
          senderId: userId,
          type: 'message_shared',
          title: 'Message Shared',
          message: `${senderName} shared a message with you in Direct Messages: "${preview}"`,
          resourceType: 'message',
          resourceId: messageId,
        });
      } catch (err) {
        this.logger.warn(`Failed to notify user ${targetUserId} of shared message: ${err}`);
      }

      results.push({
        id: shareDoc._id.toString(),
        messageId: messageId,
        conversationId: conv._id.toString(),
        ownerId: conv.userId.toString(),
        sharedWithUserId: targetUserId,
        createdAt: shareDoc.createdAt ? new Date(shareDoc.createdAt).toISOString() : new Date().toISOString(),
      });
    }

    return results;
  }

  async getSharedMessage(userId: string, messageId: string): Promise<IMessageShare> {
    if (!Types.ObjectId.isValid(messageId)) {
      throw new BadRequestException('Invalid message ID');
    }

    const message: any = await this.messageModel.findById(messageId).populate('userId', 'firstName lastName email').lean().exec();
    if (!message) {
      throw new NotFoundException('Message not found');
    }

    // Check if user is author, conversation owner, or recipient in message_shares
    const isAuthor = message.userId && (message.userId._id || message.userId).toString() === userId;
    const isShareRecipient = await this.messageShareModel.findOne({
      messageId: new Types.ObjectId(messageId),
      sharedWithUserId: new Types.ObjectId(userId),
    }).populate('createdBy', 'firstName lastName email').lean().exec();

    if (!isAuthor && !isShareRecipient) {
      // Check if user is conversation owner or collaborator
      const conv = await this.conversationModel.findById(message.conversationId).lean().exec();
      if (!conv) {
        throw new NotFoundException('Message not found');
      }
      const isConvOwner = conv.userId.toString() === userId;
      const isConvCollaborator = await this.conversationShareModel.findOne({
        conversationId: conv._id,
        sharedWithUserId: new Types.ObjectId(userId),
      });

      if (!isConvOwner && !isConvCollaborator) {
        throw new ForbiddenException('You do not have access to this shared message.');
      }
    }

    const shareDoc = isShareRecipient as any;
    const sharedBy = shareDoc?.createdBy;

    return {
      id: shareDoc ? shareDoc._id.toString() : message._id.toString(),
      messageId: message._id.toString(),
      conversationId: message.conversationId.toString(),
      ownerId: message.userId?._id ? message.userId._id.toString() : message.userId?.toString(),
      sharedWithUserId: userId,
      sharedByUser: sharedBy ? {
        id: sharedBy._id ? sharedBy._id.toString() : sharedBy.toString(),
        firstName: sharedBy.firstName,
        lastName: sharedBy.lastName,
        email: sharedBy.email,
      } : undefined,
      message: this.toIMessage(message),
      createdAt: shareDoc?.createdAt ? new Date(shareDoc.createdAt).toISOString() : new Date().toISOString(),
    };
  }

  async listSharedMessagesWithUser(userId: string): Promise<IMessageShare[]> {
    const shares = await this.messageShareModel
      .find({ sharedWithUserId: new Types.ObjectId(userId) })
      .populate({
        path: 'messageId',
        populate: { path: 'userId', select: 'firstName lastName email' },
      })
      .populate('createdBy', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return shares
      .filter((s: any) => s.messageId != null)
      .map((s: any) => {
        const msg = s.messageId;
        const creator = s.createdBy;
        return {
          id: s._id.toString(),
          messageId: msg._id.toString(),
          conversationId: s.conversationId.toString(),
          ownerId: s.ownerId.toString(),
          sharedWithUserId: userId,
          sharedByUser: creator ? {
            id: creator._id ? creator._id.toString() : creator.toString(),
            firstName: creator.firstName,
            lastName: creator.lastName,
            email: creator.email,
          } : undefined,
          message: this.toIMessage(msg),
          createdAt: s.createdAt ? new Date(s.createdAt).toISOString() : new Date().toISOString(),
        };
      });
  }

  private async getConversationParticipantIds(conv: any): Promise<string[]> {
    if (!conv) return [];
    if (conv.type === 'direct') {
      return (conv.participants || []).map((p: any) => (p._id || p).toString());
    }
    const participantIds = new Set<string>();
    if (conv.userId) {
      participantIds.add((conv.userId._id || conv.userId).toString());
    }
    if (conv._id && this.conversationShareModel) {
      try {
        const query: any = this.conversationShareModel.find({
          conversationId: conv._id,
        });
        const shares = typeof query?.exec === 'function' ? await query.exec() : (await query || []);
        if (Array.isArray(shares)) {
          for (const share of shares) {
            if (share && share.sharedWithUserId) {
              participantIds.add((share.sharedWithUserId._id || share.sharedWithUserId).toString());
            }
          }
        }
      } catch (err) {
        this.logger.warn(`Failed to resolve participant shares: ${err}`);
      }
    }
    return Array.from(participantIds);
  }

  private toIMessage(doc: any, authorUser?: any): IMessage {
    let author: IMessageAuthor | undefined;
    if (authorUser && authorUser.firstName) {
      author = {
        id: authorUser._id ? authorUser._id.toString() : (authorUser.id || authorUser.toString()),
        firstName: authorUser.firstName,
        lastName: authorUser.lastName,
        email: authorUser.email,
        role: authorUser.role,
      };
    } else if (doc.userId && typeof doc.userId === 'object' && doc.userId.firstName) {
      author = {
        id: doc.userId._id ? doc.userId._id.toString() : (doc.userId.id || doc.userId.toString()),
        firstName: doc.userId.firstName,
        lastName: doc.userId.lastName,
        email: doc.userId.email,
        role: doc.userId.role,
      };
    }

    return {
      id: doc._id.toString(),
      conversationId: doc.conversationId.toString(),
      userId: doc.userId?._id ? doc.userId._id.toString() : doc.userId?.toString(),
      author,
      role: doc.role as MessageRole,
      content: doc.content,
      mentions: doc.mentions || [],
      referencedResourceIds: doc.referencedResourceIds || [],
      citations: doc.citations || [],
      generatedChart: doc.generatedChart,
      generatedCharts: (doc as any).generatedCharts || (doc.generatedChart ? [doc.generatedChart] : []),
      generatedTable: doc.generatedTable,
      pythonCode: doc.pythonCode,
      executionOutput: doc.executionOutput,
      downloadableFile: doc.downloadableFile,
      replyToMessageId: doc.replyToMessageId,
      replyTo: doc.replyTo,
      createdAt: doc.createdAt?.toISOString ? doc.createdAt.toISOString() : (doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString()),
    };
  }
}
