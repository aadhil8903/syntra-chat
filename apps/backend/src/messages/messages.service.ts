import {
  Injectable,
  NotFoundException,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MessageEntity, MessageEntityDocument } from './schemas/message.schema';
import { ConversationEntity, ConversationEntityDocument } from '../conversations/schemas/conversation.schema';
import { SendMessageDto } from './dto/send-message.dto';
import { IMessage, MessageRole, ISendMessageResponse } from '@enter-chat/shared-types';
import { OwnershipService } from '../permissions/services/ownership.service';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';
import { MentionsService } from '../mentions/mentions.service';
import { CollectionsService } from '../collections/collections.service';

@Injectable()
export class MessagesService {
  private readonly activeGenerationsByUser = new Map<string, Set<string>>();
  private static readonly MAX_CONCURRENT_GENERATIONS = 2;

  constructor(
    @InjectModel(MessageEntity.name)
    private readonly messageModel: Model<MessageEntityDocument>,
    @InjectModel(ConversationEntity.name)
    private readonly conversationModel: Model<ConversationEntityDocument>,
    @InjectModel('DocumentEntity')
    private readonly documentModel: Model<any>,
    @InjectModel('DatasetEntity')
    private readonly datasetModel: Model<any>,
    private readonly ownershipService: OwnershipService,
    private readonly aiGatewayService: AiGatewayService,
    private readonly mentionsService: MentionsService,
    private readonly collectionsService: CollectionsService,
  ) {}

  getActiveGenerations(userId: string): string[] {
    const active = this.activeGenerationsByUser.get(userId);
    return active ? Array.from(active) : [];
  }

  async findByConversation(userId: string, conversationId: string): Promise<IMessage[]> {
    if (!Types.ObjectId.isValid(conversationId)) {
      throw new NotFoundException('Conversation not found');
    }

    // Verify conversation ownership
    await this.ownershipService.verifyOwnership('conversations', conversationId, userId);

    const messages = await this.messageModel
      .find({
        conversationId: new Types.ObjectId(conversationId),
        userId: new Types.ObjectId(userId),
      })
      .sort({ createdAt: 1 })
      .exec();

    return messages.map((m) => this.toIMessage(m));
  }

  async sendMessage(
    userId: string,
    dto: SendMessageDto,
    userRole?: string,
  ): Promise<ISendMessageResponse> {
    const { conversationId, content, referencedResourceIds = [] } = dto;

    if (!Types.ObjectId.isValid(conversationId)) {
      throw new NotFoundException('Conversation not found');
    }

    // 1. Verify conversation ownership
    const conv = await this.conversationModel.findOne({
      _id: new Types.ObjectId(conversationId),
      userId: new Types.ObjectId(userId),
    });
    if (!conv) {
      throw new NotFoundException('Conversation not found or not accessible');
    }

    // 2. Concurrency Check (Max 2 active chats generating simultaneously per user)
    const userActive = this.activeGenerationsByUser.get(userId) || new Set<string>();

    if (userActive.has(conversationId)) {
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
    userActive.add(conversationId);
    this.activeGenerationsByUser.set(userId, userActive);

    try {
      console.log('[DEBUG-3 Backend Parsing - Start]', { conversationId, content, referencedResourceIds });

    // Auto-detect any structured mention tokens (e.g. "@[study.pdf](document:68a...)" or "@[Quarter results](folder:folder:Quarter results)")
    const structuredMatches = [...content.matchAll(/@\[([^\]]+)\]\(([^:]+):([^\)]+)\)/g)];
    const autoResolvedIds: string[] = [];

    for (const match of structuredMatches) {
      const type = match[2];
      const targetId = match[3];
      if (type === 'folder') {
        autoResolvedIds.push(targetId.startsWith('folder:') ? targetId : `folder:${targetId}`);
      } else {
        autoResolvedIds.push(targetId);
      }
    }

    // Also detect natural text mentions (e.g. "@portfolio.csv" or "@test_ingestion_document.pdf")
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
                (r) => r.name.toLowerCase() === query.toLowerCase() || r.name.toLowerCase().startsWith(query.toLowerCase())
              );
              if (exact) {
                autoResolvedIds.push(exact.id);
              } else {
                autoResolvedIds.push(searchRes.results[0].id);
              }
            }
          } catch (e) {
            // Ignore mention search errors
          }
        }
      }
    }

    const explicitMentionedIds = Array.from(new Set([...referencedResourceIds, ...autoResolvedIds]));
    let allMentionedIds = [...explicitMentionedIds];

    // If no explicit mentions in current message, carry forward authorized resources from recent conversation messages
    if (allMentionedIds.length === 0) {
      try {
        const recentUserMsgs = await this.messageModel
          .find({
            conversationId: new Types.ObjectId(conversationId),
            userId: new Types.ObjectId(userId),
            referencedResourceIds: { $exists: true, $ne: [] },
          })
          .sort({ createdAt: -1 })
          .limit(3)
          .exec();

        for (const prevMsg of recentUserMsgs) {
          if (prevMsg.referencedResourceIds && prevMsg.referencedResourceIds.length > 0) {
            allMentionedIds.push(...prevMsg.referencedResourceIds);
          }
        }
        allMentionedIds = Array.from(new Set(allMentionedIds));
      } catch (err) {}
    }

    // Expand any folder mentions (e.g. "folder:Quarter results") to their contained file IDs
    const expandedResourceIds: string[] = [];
    for (const rId of allMentionedIds) {
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
        } catch (err) {
          // Continue if folder query fails
        }
      } else {
        expandedResourceIds.push(rId);
      }
    }

    const uniqueExpandedIds = Array.from(new Set(expandedResourceIds));
    console.log('[DEBUG-4 Content Resolution]', { allMentionedIds, uniqueExpandedIds, resolvedCount: uniqueExpandedIds.length });

    // 2. Verify and isolate referenced resources: Strictly filter out any unauthorized resources
    const validAccessibleResourceIds: string[] = [];
    if (uniqueExpandedIds.length > 0) {
      const validated = await this.ownershipService.validateUserResources(userId, uniqueExpandedIds);
      validAccessibleResourceIds.push(...validated.validDocumentIds, ...validated.validDatasetIds);
    }

    // 3. Save User Message (ONLY save explicit user mentions to prevent unwanted UI chip badges)
    const userMsgDoc = new this.messageModel({
      conversationId: new Types.ObjectId(conversationId),
      userId: new Types.ObjectId(userId),
      role: MessageRole.USER,
      content,
      referencedResourceIds: explicitMentionedIds,
    });
    const savedUserMsg = await userMsgDoc.save();

    // 4. Validate and filter ANY legacy attached resources from the conversation
    const validConvAttachedIds: string[] = [];
    if (conv.attachedResourceIds && conv.attachedResourceIds.length > 0) {
      const validated = await this.ownershipService.validateUserResources(userId, conv.attachedResourceIds);
      validConvAttachedIds.push(...validated.validDocumentIds, ...validated.validDatasetIds);
    }

    const combinedResourceIds = Array.from(
      new Set([...validConvAttachedIds, ...validAccessibleResourceIds]),
    );

    // 5. Fetch previous conversation history (up to 50 recent messages in chronological order)
    const pastMessages = await this.messageModel
      .find({
        conversationId: new Types.ObjectId(conversationId),
        userId: new Types.ObjectId(userId),
        _id: { $ne: savedUserMsg._id },
      })
      .sort({ createdAt: -1 })
      .limit(50)
      .exec();

    const history = pastMessages.reverse().map((m) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    }));

    // 5.5 Retrieve Collection Shared Memory if conversation is assigned to a collection
    let sharedMemory = '';
    if (conv.collectionId) {
      sharedMemory = await this.collectionsService.getSharedMemory(userId, conv.collectionId.toString());
    }

    // 6. Call AI Service via AiGateway
    const aiResponse = await this.aiGatewayService.chat({
      userId,
      userRole,
      conversationId,
      message: content,
      resourceIds: combinedResourceIds,
      sharedMemory: sharedMemory || undefined,
      history,
    });

    // 7. Save Assistant Message
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
    });
    const savedAssistantMsg = await assistantMsgDoc.save();

    // 7.5 Update Collection Shared Memory if collection assigned
    if (conv.collectionId && aiResponse.answer) {
      const summaryCandidate = `Chat "${conv.title}": Q: "${content.slice(0, 120)}" -> A: ${aiResponse.answer.slice(0, 250).replace(/[\r\n]+/g, ' ')}`;
      this.collectionsService.updateSharedMemory(userId, conv.collectionId.toString(), summaryCandidate).catch((err) => {
        console.error('Failed to update collection shared memory:', err);
      });
    }

    // 8. Update conversation timestamp and optionally generate title
    const updatePayload: any = { lastMessageAt: new Date() };

    if (pastMessages.length === 0 || conv.title === 'New Conversation' || !conv.title || conv.title.startsWith('New Conversation')) {
      try {
        const title = await this.aiGatewayService.generateTitle(content);
        if (title && title !== 'New Conversation') {
          updatePayload.title = title;
        }
      } catch (e) {
        console.error('Auto-naming failed:', e);
      }
    }

    const updatedConv = await this.conversationModel.findByIdAndUpdate(
      conversationId,
      { $set: updatePayload },
      { new: true }
    );

    return {
      userMessage: this.toIMessage(savedUserMsg),
      assistantMessage: this.toIMessage(savedAssistantMsg),
      conversation: updatedConv ? {
        id: updatedConv._id.toString(),
        title: updatedConv.title,
        userId: updatedConv.userId.toString(),
        collectionId: updatedConv.collectionId ? updatedConv.collectionId.toString() : null,
        attachedResourceIds: updatedConv.attachedResourceIds,
        createdAt: updatedConv.createdAt.toISOString(),
        updatedAt: updatedConv.updatedAt.toISOString(),
      } : undefined
    };
    } finally {
      userActive.delete(conversationId);
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
    const { conversationId, content, referencedResourceIds = [] } = dto;

    if (!Types.ObjectId.isValid(conversationId)) {
      throw new NotFoundException('Conversation not found');
    }

    // 1. Verify conversation ownership
    const conv = await this.conversationModel.findOne({
      _id: new Types.ObjectId(conversationId),
      userId: new Types.ObjectId(userId),
    });
    if (!conv) {
      throw new NotFoundException('Conversation not found or not accessible');
    }

    // 2. Concurrency Check (Max 2 active chats generating simultaneously per user)
    const userActive = this.activeGenerationsByUser.get(userId) || new Set<string>();

    if (userActive.has(conversationId)) {
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
    userActive.add(conversationId);
    this.activeGenerationsByUser.set(userId, userActive);

    // Prepare SSE response headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    try {
      // Auto-detect structured and natural mentions
      const structuredMatches = [...content.matchAll(/@\[([^\]]+)\]\(([^:]+):([^\)]+)\)/g)];
      const autoResolvedIds: string[] = [];

      for (const match of structuredMatches) {
        const type = match[2];
        const targetId = match[3];
        if (type === 'folder') {
          autoResolvedIds.push(targetId.startsWith('folder:') ? targetId : `folder:${targetId}`);
        } else {
          autoResolvedIds.push(targetId);
        }
      }

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
                  (r) => r.name.toLowerCase() === query.toLowerCase() || r.name.toLowerCase().startsWith(query.toLowerCase())
                );
                if (exact) {
                  autoResolvedIds.push(exact.id);
                } else {
                  autoResolvedIds.push(searchRes.results[0].id);
                }
              }
            } catch (e) {}
          }
        }
      }

      const explicitMentionedIds = Array.from(new Set([...referencedResourceIds, ...autoResolvedIds]));
      let allMentionedIds = [...explicitMentionedIds];

      // If no explicit mentions in current message, carry forward authorized resources from recent conversation messages
      if (allMentionedIds.length === 0) {
        try {
          const recentUserMsgs = await this.messageModel
            .find({
              conversationId: new Types.ObjectId(conversationId),
              userId: new Types.ObjectId(userId),
              referencedResourceIds: { $exists: true, $ne: [] },
            })
            .sort({ createdAt: -1 })
            .limit(3)
            .exec();

          for (const prevMsg of recentUserMsgs) {
            if (prevMsg.referencedResourceIds && prevMsg.referencedResourceIds.length > 0) {
              allMentionedIds.push(...prevMsg.referencedResourceIds);
            }
          }
          allMentionedIds = Array.from(new Set(allMentionedIds));
        } catch (err) {}
      }

      // Expand folders
      const expandedResourceIds: string[] = [];
      for (const rId of allMentionedIds) {
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

      // Security: Validate user resources
      const validAccessibleResourceIds: string[] = [];
      if (uniqueExpandedIds.length > 0) {
        const validated = await this.ownershipService.validateUserResources(userId, uniqueExpandedIds);
        validAccessibleResourceIds.push(...validated.validDocumentIds, ...validated.validDatasetIds);
      }

      // Save user message (ONLY save explicit user mentions to prevent unwanted UI chip badges)
      const userMsgDoc = new this.messageModel({
        conversationId: new Types.ObjectId(conversationId),
        userId: new Types.ObjectId(userId),
        role: MessageRole.USER,
        content,
        referencedResourceIds: explicitMentionedIds,
      });
      const savedUserMsg = await userMsgDoc.save();

      // Legacy attached resources
      const validConvAttachedIds: string[] = [];
      if (conv.attachedResourceIds && conv.attachedResourceIds.length > 0) {
        const validated = await this.ownershipService.validateUserResources(userId, conv.attachedResourceIds);
        validConvAttachedIds.push(...validated.validDocumentIds, ...validated.validDatasetIds);
      }

      const combinedResourceIds = Array.from(
        new Set([...validConvAttachedIds, ...validAccessibleResourceIds]),
      );

      // History
      const pastMessages = await this.messageModel
        .find({
          conversationId: new Types.ObjectId(conversationId),
          userId: new Types.ObjectId(userId),
          _id: { $ne: savedUserMsg._id },
        })
        .sort({ createdAt: -1 })
        .limit(50)
        .exec();

      const history = pastMessages.reverse().map((m) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      }));

      // 5.5 Retrieve Collection Shared Memory if conversation is assigned to a collection
      let sharedMemory = '';
      if (conv.collectionId) {
        sharedMemory = await this.collectionsService.getSharedMemory(userId, conv.collectionId.toString());
      }

      // Send initial user message event to frontend
      res.write(`event: user_message\ndata: ${JSON.stringify(this.toIMessage(savedUserMsg))}\n\n`);

      let fullAnswer = '';
      let metadata: any = {};

      try {
        const stream = await this.aiGatewayService.streamChat({
          userId,
          userRole,
          conversationId,
          message: content,
          resourceIds: combinedResourceIds,
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
              res.write(`${block}\n\n`);

              const eventMatch = block.match(/event:\s*(\w+)/);
              const dataMatch = block.match(/data:\s*(.+)/);
              if (eventMatch && dataMatch) {
                const eventType = eventMatch[1];
                try {
                  const parsed = JSON.parse(dataMatch[1]);
                  if (eventType === 'token' && parsed.token) {
                    fullAnswer += parsed.token;
                  } else if (eventType === 'metadata') {
                    metadata = parsed;
                  }
                } catch (e) {}
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
          intent: chatRes.intent || 'general_chat',
        };

        // Stream answer progressively to frontend
        const words = fullAnswer.split(' ');
        for (let i = 0; i < words.length; i++) {
          const chunk = i === words.length - 1 ? words[i] : words[i] + ' ';
          res.write(`event: token\ndata: ${JSON.stringify({ token: chunk })}\n\n`);
          await new Promise((r) => setTimeout(r, 15));
        }

        res.write(`event: metadata\ndata: ${JSON.stringify(metadata)}\n\n`);
      }
      // Save Assistant Message
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
      });
      const savedAssistantMsg = await assistantMsgDoc.save();

      // Update Collection Shared Memory if conversation belongs to a collection
      if (conv.collectionId && fullAnswer) {
        const summaryCandidate = `Chat "${conv.title}": Q: "${content.slice(0, 120)}" -> A: ${fullAnswer.slice(0, 250).replace(/[\r\n]+/g, ' ')}`;
        this.collectionsService.updateSharedMemory(userId, conv.collectionId.toString(), summaryCandidate).catch((err) => {
          console.error('Failed to update collection shared memory:', err);
        });
      }

      // Update conversation title if needed
      const updatePayload: any = { lastMessageAt: new Date() };
      if (pastMessages.length === 0 || conv.title === 'New Conversation' || !conv.title || conv.title.startsWith('New Conversation')) {
        try {
          const title = await this.aiGatewayService.generateTitle(content);
          if (title && title !== 'New Conversation') {
            updatePayload.title = title;
          }
        } catch (e) {}
      }

      const updatedConv = await this.conversationModel.findByIdAndUpdate(
        conversationId,
        { $set: updatePayload },
        { new: true }
      );

      // Send completion message
      res.write(`event: completed_message\ndata: ${JSON.stringify({
        assistantMessage: this.toIMessage(savedAssistantMsg),
        conversation: updatedConv ? {
          id: updatedConv._id.toString(),
          title: updatedConv.title,
          userId: updatedConv.userId.toString(),
          collectionId: updatedConv.collectionId ? updatedConv.collectionId.toString() : null,
          attachedResourceIds: updatedConv.attachedResourceIds,
          createdAt: updatedConv.createdAt.toISOString(),
          updatedAt: updatedConv.updatedAt.toISOString(),
        } : undefined,
      })}\n\n`);

      res.end();
    } catch (err: any) {
      if (!res.headersSent) {
        throw err;
      }
      res.write(`event: error\ndata: ${JSON.stringify({ error: err.message || 'Processing failed' })}\n\n`);
      res.end();
    } finally {
      userActive.delete(conversationId);
      if (userActive.size === 0) {
        this.activeGenerationsByUser.delete(userId);
      }
    }
  }

  toIMessage(doc: MessageEntityDocument): IMessage {
    return {
      id: doc._id.toString(),
      conversationId: doc.conversationId.toString(),
      userId: doc.userId.toString(),
      role: doc.role,
      content: doc.content,
      referencedResourceIds: doc.referencedResourceIds || [],
      citations: doc.citations,
      generatedChart: doc.generatedChart,
      generatedCharts: (doc as any).generatedCharts || (doc.generatedChart ? [doc.generatedChart] : undefined),
      generatedTable: doc.generatedTable,
      pythonCode: doc.pythonCode,
      executionOutput: doc.executionOutput,
      createdAt: doc.createdAt?.toISOString() || new Date().toISOString(),
    };
  }
}

