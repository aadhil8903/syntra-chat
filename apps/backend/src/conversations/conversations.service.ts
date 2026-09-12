import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Types, Connection } from 'mongoose';
import { ConversationEntity, ConversationEntityDocument } from './schemas/conversation.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  IConversation,
  ICreateConversationDto,
  IUpdateConversationDto,
  IDirectConversationItem,
  IOrgMember,
  IDocument,
} from '@enter-chat/shared-types';
import { OwnershipService } from '../permissions/services/ownership.service';
import { PresenceService } from '../users/presence.service';
import { DocumentsService } from '../documents/documents.service';

@Injectable()
export class ConversationsService {
  constructor(
    @InjectModel(ConversationEntity.name)
    private readonly conversationModel: Model<ConversationEntityDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectConnection()
    private readonly connection: Connection,
    private readonly ownershipService: OwnershipService,
    private readonly presenceService: PresenceService,
    private readonly documentsService: DocumentsService,
  ) {}

  async create(userId: string, dto: ICreateConversationDto): Promise<IConversation> {
    let attached = dto.attachedResourceIds || [];
    if (attached.length > 0) {
      const validated = await this.ownershipService.validateUserResources(userId, attached);
      attached = Array.from(new Set([...validated.validDocumentIds, ...validated.validDatasetIds]));
    }

    const conversation = new this.conversationModel({
      userId: new Types.ObjectId(userId),
      type: 'ai',
      title: dto.title || 'New Conversation',
      collectionId: dto.collectionId && Types.ObjectId.isValid(dto.collectionId) ? new Types.ObjectId(dto.collectionId) : undefined,
      attachedResourceIds: attached,
      activeScope: dto.activeScope ? {
        type: dto.activeScope.type,
        id: dto.activeScope.id,
        name: dto.activeScope.name,
        updatedAt: dto.activeScope.updatedAt ? new Date(dto.activeScope.updatedAt) : new Date(),
      } : undefined,
      pinned: dto.pinned || false,
      archived: dto.archived || false,
    });

    const saved = await conversation.save();
    return this.toIConversation(saved);
  }

  async findAllByUser(
    userId: string,
    archived?: boolean,
    pagination?: { page?: number; limit?: number },
  ): Promise<IConversation[]> {
    // Only return personal AI conversations, not direct user-to-user messages
    const filter: any = {
      userId: new Types.ObjectId(userId),
      $or: [{ type: 'ai' }, { type: { $exists: false } }, { type: null }],
    };
    if (archived !== undefined) {
      filter.archived = archived;
    }
    const query = this.conversationModel
      .find(filter)
      .sort({ pinned: -1, updatedAt: -1 });

    if (pagination && pagination.limit && pagination.limit > 0) {
      const page = Math.max(1, pagination.page || 1);
      const skip = (page - 1) * pagination.limit;
      query.skip(skip).limit(pagination.limit);
    }

    const convs = await query.exec();
    return convs.map((c) => this.toIConversation(c));
  }

  async search(userId: string, query: string, archived?: boolean): Promise<IConversation[]> {
    const trimmed = (query || '').trim();
    const filter: any = {
      userId: new Types.ObjectId(userId),
      $or: [{ type: 'ai' }, { type: { $exists: false } }, { type: null }],
    };
    if (archived !== undefined) {
      filter.archived = archived;
    }

    if (!trimmed) {
      const convs = await this.conversationModel
        .find(filter)
        .sort({ pinned: -1, updatedAt: -1 })
        .exec();
      return convs.map((c) => this.toIConversation(c));
    }

    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    filter.title = { $regex: regex };

    // Strict keyword match on chat title only
    const matchedConvs = await this.conversationModel
      .find(filter)
      .sort({ pinned: -1, updatedAt: -1 })
      .exec();

    return matchedConvs.map((c) => this.toIConversation(c));
  }

  // ---------------- Direct Conversations ----------------
  async getOrCreateDirectConversation(userId: string, targetUserId: string): Promise<IConversation> {
    if (!targetUserId || !Types.ObjectId.isValid(targetUserId)) {
      throw new BadRequestException('Invalid target user ID');
    }
    if (userId === targetUserId) {
      throw new BadRequestException('Cannot start a direct conversation with yourself');
    }

    const [currentUser, targetUser] = await Promise.all([
      this.userModel.findById(userId).lean().exec(),
      this.userModel.findById(targetUserId).lean().exec(),
    ]);

    if (!targetUser || targetUser.isDeleted || targetUser.status === 'suspended') {
      throw new NotFoundException('Target user not found or unavailable');
    }
    if (!currentUser || currentUser.isDeleted || currentUser.status === 'suspended') {
      throw new ForbiddenException('Current user is not active');
    }

    const userObjId = new Types.ObjectId(userId);
    const targetObjId = new Types.ObjectId(targetUserId);

    let conv = await this.conversationModel.findOne({
      type: 'direct',
      participants: { $all: [userObjId, targetObjId], $size: 2 },
    });

    if (!conv) {
      conv = new this.conversationModel({
        userId: userObjId,
        type: 'direct',
        participants: [userObjId, targetObjId],
        title: `${targetUser.firstName} ${targetUser.lastName}`,
        attachedResourceIds: [],
        unreadCounts: new Map(),
      });
      await conv.save();
    }

    return this.buildDirectConversationDto(conv, userId, targetUser);
  }

  async listDirectConversations(userId: string): Promise<IDirectConversationItem[]> {
    const userObjId = new Types.ObjectId(userId);
    const convs = await this.conversationModel
      .find({
        type: 'direct',
        participants: userObjId,
      })
      .sort({ updatedAt: -1 })
      .exec();

    const partnerIds = convs.map((c) => {
      const p = c.participants.find((id) => id.toString() !== userId);
      return p ? p.toString() : null;
    }).filter(Boolean) as string[];

    const partnerUsers = await this.userModel
      .find({ _id: { $in: partnerIds.map((id) => new Types.ObjectId(id)) } })
      .select('_id email firstName lastName role departments lastSeenAt status')
      .lean()
      .exec();

    const userMap = new Map<string, any>();
    partnerUsers.forEach((u) => userMap.set(u._id.toString(), u));

    return convs.map((c) => {
      const partnerId = c.participants.find((id) => id.toString() !== userId)?.toString() || '';
      const partnerUser = userMap.get(partnerId);
      const presence = partnerUser
        ? this.presenceService.calculatePresence(partnerId, partnerUser.lastSeenAt)
        : { userId: partnerId, isOnline: false, lastSeenRelative: 'Unknown' };

      const partnerDto: IOrgMember = {
        id: partnerId,
        email: partnerUser?.email || '',
        firstName: partnerUser?.firstName || 'Unknown',
        lastName: partnerUser?.lastName || 'User',
        role: partnerUser?.role || 'user',
        departments: partnerUser?.departments || [],
        presence,
      };

      const unreadCount = (c.unreadCounts as any)?.get?.(userId) ?? (c.unreadCounts as any)?.[userId] ?? 0;

      return {
        id: c._id.toString(),
        type: 'direct' as const,
        partner: partnerDto,
        lastMessage: c.lastMessage ? {
          content: c.lastMessage.content,
          senderId: c.lastMessage.senderId.toString(),
          senderName: c.lastMessage.senderName,
          createdAt: c.lastMessage.createdAt.toISOString(),
          role: c.lastMessage.role,
          isAi: c.lastMessage.isAi,
        } : null,
        unreadCount,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      };
    });
  }

  async getDirectConversation(userId: string, conversationId: string): Promise<IConversation> {
    if (!Types.ObjectId.isValid(conversationId)) {
      throw new NotFoundException('Direct conversation not found');
    }

    const conv = await this.conversationModel.findById(conversationId);
    if (!conv || conv.type !== 'direct') {
      throw new NotFoundException('Direct conversation not found');
    }

    const isParticipant = conv.participants.some((p) => p.toString() === userId);
    if (!isParticipant) {
      throw new ForbiddenException('Access denied to this direct conversation');
    }

    const partnerId = conv.participants.find((p) => p.toString() !== userId)?.toString();
    const partnerUser = partnerId
      ? await this.userModel.findById(partnerId).lean().exec()
      : null;

    return this.buildDirectConversationDto(conv, userId, partnerUser);
  }

  async markDirectConversationAsRead(userId: string, conversationId: string): Promise<{ success: boolean }> {
    if (!Types.ObjectId.isValid(conversationId)) {
      throw new NotFoundException('Direct conversation not found');
    }

    const conv = await this.conversationModel.findById(conversationId);
    if (!conv || conv.type !== 'direct') {
      throw new NotFoundException('Direct conversation not found');
    }

    const isParticipant = conv.participants.some((p) => p.toString() === userId);
    if (!isParticipant) {
      throw new ForbiddenException('Access denied');
    }

    if (!conv.unreadCounts) {
      conv.unreadCounts = new Map();
    }
    if (conv.unreadCounts.set) {
      conv.unreadCounts.set(userId, 0);
    } else {
      (conv.unreadCounts as any)[userId] = 0;
    }
    conv.markModified('unreadCounts');
    await conv.save();

    return { success: true };
  }

  async uploadDirectAttachment(
    userId: string,
    conversationId: string,
    file: Express.Multer.File,
  ): Promise<IDocument> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    if (!conversationId || !Types.ObjectId.isValid(conversationId)) {
      throw new NotFoundException('Direct conversation not found');
    }

    const conv = await this.conversationModel.findById(conversationId);
    if (!conv || conv.type !== 'direct') {
      throw new NotFoundException('Direct conversation not found');
    }

    const isParticipant = conv.participants.some((p) => p.toString() === userId);
    if (!isParticipant) {
      throw new ForbiddenException('You are not a participant in this direct conversation');
    }

    return this.documentsService.uploadDirectAttachment(userId, file);
  }

  private buildDirectConversationDto(
    conv: ConversationEntityDocument,
    userId: string,
    partnerUser: any,
  ): IConversation {
    const partnerId = partnerUser?._id?.toString() || conv.participants.find((p) => p.toString() !== userId)?.toString() || '';
    const presence = partnerUser
      ? this.presenceService.calculatePresence(partnerId, partnerUser.lastSeenAt)
      : { userId: partnerId, isOnline: false, lastSeenRelative: 'Unknown' };

    const partnerDto: IOrgMember = {
      id: partnerId,
      email: partnerUser?.email || '',
      firstName: partnerUser?.firstName || 'Unknown',
      lastName: partnerUser?.lastName || 'User',
      role: partnerUser?.role || 'user',
      departments: partnerUser?.departments || [],
      presence,
    };

    const unreadCount = (conv.unreadCounts as any)?.get?.(userId) ?? (conv.unreadCounts as any)?.[userId] ?? 0;

    return {
      id: conv._id.toString(),
      userId: conv.userId.toString(),
      type: 'direct',
      participants: conv.participants.map((p) => p.toString()),
      title: `${partnerDto.firstName} ${partnerDto.lastName}`,
      collectionId: null,
      attachedResourceIds: [],
      activeScope: null,
      pinned: false,
      archived: false,
      lastMessage: conv.lastMessage ? {
        content: conv.lastMessage.content,
        senderId: conv.lastMessage.senderId.toString(),
        senderName: conv.lastMessage.senderName,
        createdAt: conv.lastMessage.createdAt.toISOString(),
        role: conv.lastMessage.role,
        isAi: conv.lastMessage.isAi,
      } : null,
      unreadCount,
      partner: partnerDto,
      createdAt: conv.createdAt.toISOString(),
      updatedAt: conv.updatedAt.toISOString(),
    };
  }

  async findOneByUser(userId: string, conversationId: string): Promise<IConversation> {
    if (!Types.ObjectId.isValid(conversationId)) {
      throw new NotFoundException('Conversation not found');
    }

    const conv = await this.conversationModel.findById(conversationId);
    if (!conv) {
      throw new NotFoundException('Conversation not found');
    }

    // Direct conversation participant check
    if (conv.type === 'direct') {
      const isParticipant = conv.participants.some((p) => p.toString() === userId);
      if (!isParticipant) {
        throw new ForbiddenException('Access denied to this direct conversation');
      }
      const partnerId = conv.participants.find((p) => p.toString() !== userId)?.toString();
      const partnerUser = partnerId
        ? await this.userModel.findById(partnerId).lean().exec()
        : null;
      return this.buildDirectConversationDto(conv, userId, partnerUser);
    }

    // Owner check
    if (conv.userId.toString() === userId) {
      return this.toIConversation(conv);
    }

    // Check if shared with user
    const share = await this.connection.collection('conversation_shares').findOne({
      conversationId: new Types.ObjectId(conversationId),
      sharedWithUserId: new Types.ObjectId(userId),
    });

    if (share && !conv.archived) {
      return this.toIConversation(conv);
    }

    throw new NotFoundException('Conversation not found');
  }

  async update(
    userId: string,
    conversationId: string,
    dto: IUpdateConversationDto,
  ): Promise<IConversation> {
    if (!Types.ObjectId.isValid(conversationId)) {
      throw new NotFoundException('Conversation not found');
    }

    const updateData: any = {};
    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.collectionId !== undefined) {
      updateData.collectionId = dto.collectionId && Types.ObjectId.isValid(dto.collectionId)
        ? new Types.ObjectId(dto.collectionId)
        : null;
    }
    if (dto.attachedResourceIds !== undefined) {
      if (dto.attachedResourceIds.length > 0) {
        const validated = await this.ownershipService.validateUserResources(userId, dto.attachedResourceIds);
        updateData.attachedResourceIds = Array.from(new Set([...validated.validDocumentIds, ...validated.validDatasetIds]));
      } else {
        updateData.attachedResourceIds = [];
      }
    }
    if (dto.pinned !== undefined) updateData.pinned = dto.pinned;
    if (dto.archived !== undefined) updateData.archived = dto.archived;
    if (dto.activeScope !== undefined) {
      updateData.activeScope = dto.activeScope ? {
        type: dto.activeScope.type,
        id: dto.activeScope.id,
        name: dto.activeScope.name,
        updatedAt: dto.activeScope.updatedAt ? new Date(dto.activeScope.updatedAt) : new Date(),
      } : null;
    }

    const conv = await this.conversationModel.findOneAndUpdate(
      { _id: new Types.ObjectId(conversationId), userId: new Types.ObjectId(userId) },
      { $set: updateData },
      { new: true },
    );

    if (!conv) {
      throw new NotFoundException('Conversation not found');
    }

    return this.toIConversation(conv);
  }

  async delete(userId: string, conversationId: string): Promise<void> {
    if (!Types.ObjectId.isValid(conversationId)) {
      throw new NotFoundException('Conversation not found');
    }

    const conv = await this.conversationModel.findOneAndDelete({
      _id: new Types.ObjectId(conversationId),
      userId: new Types.ObjectId(userId),
    });

    if (!conv) {
      throw new NotFoundException('Conversation not found');
    }

    // Delete associated messages, conversation shares, and message shares
    const messagesCollection = this.connection.collection('messages');
    await messagesCollection.deleteMany({
      conversationId: new Types.ObjectId(conversationId),
    });

    const conversationSharesCollection = this.connection.collection('conversation_shares');
    await conversationSharesCollection.deleteMany({
      conversationId: new Types.ObjectId(conversationId),
    });

    const messageSharesCollection = this.connection.collection('message_shares');
    await messageSharesCollection.deleteMany({
      conversationId: new Types.ObjectId(conversationId),
    });
  }

  toIConversation(doc: ConversationEntityDocument): IConversation {
    return {
      id: doc._id.toString(),
      userId: doc.userId.toString(),
      title: doc.title,
      collectionId: doc.collectionId ? doc.collectionId.toString() : null,
      attachedResourceIds: doc.attachedResourceIds || [],
      activeScope: doc.activeScope ? {
        type: doc.activeScope.type,
        id: doc.activeScope.id,
        name: doc.activeScope.name,
        updatedAt: doc.activeScope.updatedAt instanceof Date
          ? doc.activeScope.updatedAt.toISOString()
          : (doc.activeScope.updatedAt as any)?.toString?.(),
      } : undefined,
      pinned: !!doc.pinned,
      archived: !!doc.archived,
      lastMessageAt: doc.lastMessageAt?.toISOString(),
      createdAt: doc.createdAt?.toISOString() || new Date().toISOString(),
      updatedAt: doc.updatedAt?.toISOString() || new Date().toISOString(),
    };
  }
}

