import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ConversationShareEntity,
  ConversationShareDocument,
} from './schemas/conversation-share.schema';
import {
  ConversationEntity,
  ConversationEntityDocument,
} from './schemas/conversation.schema';
import { MessageEntity, MessageEntityDocument } from '../messages/schemas/message.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  IConversationShare,
  ISharedConversationItem,
  IShareConversationDto,
  SharePermission,
  MessageRole,
} from '@enter-chat/shared-types';
import { PresenceService } from '../users/presence.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ConversationSharesService {
  private readonly logger = new Logger(ConversationSharesService.name);

  constructor(
    @InjectModel(ConversationShareEntity.name)
    private readonly shareModel: Model<ConversationShareDocument>,
    @InjectModel(ConversationEntity.name)
    private readonly conversationModel: Model<ConversationEntityDocument>,
    @InjectModel(MessageEntity.name)
    private readonly messageModel: Model<MessageEntityDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly presenceService: PresenceService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async shareConversation(
    ownerId: string,
    conversationId: string,
    dto: IShareConversationDto,
  ): Promise<IConversationShare[]> {
    if (!Types.ObjectId.isValid(conversationId)) {
      throw new BadRequestException('Invalid conversation ID');
    }

    const conv = await this.conversationModel.findOne({
      _id: new Types.ObjectId(conversationId),
      userId: new Types.ObjectId(ownerId),
    });

    if (!conv) {
      throw new NotFoundException(
        'Conversation not found or you do not have permission to share it.',
      );
    }

    if (!dto.userIds || !Array.isArray(dto.userIds) || dto.userIds.length === 0) {
      throw new BadRequestException('At least one user must be selected to share with.');
    }

    const permission: SharePermission = dto.permission === 'contribute' ? 'contribute' : 'view';
    const owner = await this.userModel.findById(ownerId).lean().exec();
    const ownerName = owner ? `${owner.firstName} ${owner.lastName}`.trim() : 'A colleague';
    const ownerObjId = new Types.ObjectId(ownerId);

    for (const targetUserId of dto.userIds) {
      if (targetUserId === ownerId) continue;
      if (!Types.ObjectId.isValid(targetUserId)) continue;

      const targetObjId = new Types.ObjectId(targetUserId);

      await this.shareModel.findOneAndUpdate(
        {
          conversationId: new Types.ObjectId(conversationId),
          sharedWithUserId: targetObjId,
        },
        {
          $set: {
            ownerId: ownerObjId,
            permission,
            createdBy: ownerObjId,
          },
        },
        { upsert: true, new: true },
      );

      // Find or create 1:1 Direct Conversation between owner and recipient
      let directConv = await this.conversationModel.findOne({
        type: 'direct',
        participants: { $all: [ownerObjId, targetObjId] },
      });

      if (!directConv) {
        const targetUser = await this.userModel.findById(targetObjId).lean().exec();
        directConv = new this.conversationModel({
          userId: ownerObjId,
          type: 'direct',
          participants: [ownerObjId, targetObjId],
          title: targetUser ? `${targetUser.firstName} ${targetUser.lastName}` : 'Direct Message',
          attachedResourceIds: [],
          unreadCounts: new Map(),
        });
        await directConv.save();
      }

      const permText = permission === 'contribute' ? 'collaborative (can edit)' : 'view-only';
      const shareContent = `${ownerName} shared a collaborative conversation with you: **[${conv.title}](/chat/${conv._id})** (${permText} access). Click to open the conversation thread.`;

      const directMsg = new this.messageModel({
        conversationId: directConv._id,
        userId: ownerObjId,
        role: MessageRole.USER,
        content: shareContent,
        referencedResourceIds: [conv._id.toString()],
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
        content: shareContent.length > 80 ? shareContent.slice(0, 77) + '...' : shareContent,
        senderId: ownerObjId,
        senderName: ownerName,
        createdAt: new Date(),
        role: 'user',
      };
      directConv.updatedAt = new Date();
      await directConv.save();

      // Create notification
      try {
        await this.notificationsService.createNotification({
          userId: targetUserId,
          senderId: ownerId,
          type: 'conversation_shared',
          title: 'Conversation Shared',
          message: `${ownerName} shared "${conv.title}" with you (${permission === 'contribute' ? 'Can contribute' : 'Can view'}).`,
          resourceType: 'conversation',
          resourceId: conversationId,
        });
      } catch (err) {
        this.logger.warn(`Failed to notify user ${targetUserId} of shared conversation: ${err}`);
      }
    }

    return this.listConversationShares(ownerId, conversationId);
  }

  async listConversationShares(
    userId: string,
    conversationId: string,
  ): Promise<IConversationShare[]> {
    if (!Types.ObjectId.isValid(conversationId)) {
      throw new BadRequestException('Invalid conversation ID');
    }

    // Check if user is owner or has share access
    const conv = await this.conversationModel.findById(conversationId).lean().exec();
    if (!conv) {
      throw new NotFoundException('Conversation not found');
    }

    const isOwner = conv.userId.toString() === userId;
    if (!isOwner) {
      const share = await this.shareModel.findOne({
        conversationId: new Types.ObjectId(conversationId),
        sharedWithUserId: new Types.ObjectId(userId),
      });
      if (!share) {
        throw new ForbiddenException('You do not have permission to view access list for this conversation.');
      }
    }

    const shares = await this.shareModel
      .find({ conversationId: new Types.ObjectId(conversationId) })
      .populate('sharedWithUserId', 'firstName lastName email lastSeenAt')
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return shares.map((s: any) => {
      const user = s.sharedWithUserId;
      const targetUserId = user?._id ? user._id.toString() : s.sharedWithUserId?.toString();
      const presence = user ? this.presenceService.calculatePresence(targetUserId, user.lastSeenAt) : undefined;

      return {
        id: s._id.toString(),
        conversationId: s.conversationId.toString(),
        ownerId: s.ownerId.toString(),
        sharedWithUserId: targetUserId,
        sharedWithUser: user ? {
          id: targetUserId,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          presence,
        } : undefined,
        permission: s.permission,
        createdBy: s.createdBy?.toString(),
        createdAt: s.createdAt ? new Date(s.createdAt).toISOString() : new Date().toISOString(),
        updatedAt: s.updatedAt ? new Date(s.updatedAt).toISOString() : new Date().toISOString(),
      };
    });
  }

  async updateSharePermission(
    ownerId: string,
    conversationId: string,
    targetUserId: string,
    permission: SharePermission,
  ): Promise<IConversationShare> {
    if (!Types.ObjectId.isValid(conversationId) || !Types.ObjectId.isValid(targetUserId)) {
      throw new BadRequestException('Invalid ID provided');
    }

    const conv = await this.conversationModel.findOne({
      _id: new Types.ObjectId(conversationId),
      userId: new Types.ObjectId(ownerId),
    });

    if (!conv) {
      throw new ForbiddenException('Only the conversation owner can modify permissions.');
    }

    const updated = await this.shareModel
      .findOneAndUpdate(
        {
          conversationId: new Types.ObjectId(conversationId),
          sharedWithUserId: new Types.ObjectId(targetUserId),
        },
        { $set: { permission } },
        { new: true },
      )
      .populate('sharedWithUserId', 'firstName lastName email lastSeenAt')
      .lean()
      .exec();

    if (!updated) {
      throw new NotFoundException('Share record not found');
    }

    // Notify user of permission update
    try {
      const owner = await this.userModel.findById(ownerId).lean().exec();
      const ownerName = owner ? `${owner.firstName} ${owner.lastName}`.trim() : 'Owner';
      await this.notificationsService.createNotification({
        userId: targetUserId,
        senderId: ownerId,
        type: 'permission_updated',
        title: 'Permission Updated',
        message: `${ownerName} updated your permission for "${conv.title}" to ${permission === 'contribute' ? 'Can contribute' : 'Can view'}.`,
        resourceType: 'conversation',
        resourceId: conversationId,
      });
    } catch (err) {
      this.logger.warn(`Failed to notify user ${targetUserId} of permission update: ${err}`);
    }

    const user: any = updated.sharedWithUserId;
    const presence = user ? this.presenceService.calculatePresence(targetUserId, user.lastSeenAt) : undefined;

    return {
      id: updated._id.toString(),
      conversationId: updated.conversationId.toString(),
      ownerId: updated.ownerId.toString(),
      sharedWithUserId: targetUserId,
      sharedWithUser: user ? {
        id: targetUserId,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        presence,
      } : undefined,
      permission: updated.permission,
      createdBy: updated.createdBy?.toString(),
      createdAt: updated.createdAt ? new Date(updated.createdAt).toISOString() : new Date().toISOString(),
      updatedAt: updated.updatedAt ? new Date(updated.updatedAt).toISOString() : new Date().toISOString(),
    };
  }

  async revokeShare(
    ownerId: string,
    conversationId: string,
    targetUserId: string,
  ): Promise<{ success: boolean }> {
    if (!Types.ObjectId.isValid(conversationId) || !Types.ObjectId.isValid(targetUserId)) {
      throw new BadRequestException('Invalid ID provided');
    }

    const conv = await this.conversationModel.findOne({
      _id: new Types.ObjectId(conversationId),
      userId: new Types.ObjectId(ownerId),
    });

    if (!conv) {
      throw new ForbiddenException('Only the conversation owner can revoke access.');
    }

    await this.shareModel.deleteOne({
      conversationId: new Types.ObjectId(conversationId),
      sharedWithUserId: new Types.ObjectId(targetUserId),
    });

    // Notify user of access revocation
    try {
      const owner = await this.userModel.findById(ownerId).lean().exec();
      const ownerName = owner ? `${owner.firstName} ${owner.lastName}`.trim() : 'Owner';
      await this.notificationsService.createNotification({
        userId: targetUserId,
        senderId: ownerId,
        type: 'access_revoked',
        title: 'Access Revoked',
        message: `${ownerName} removed your access to "${conv.title}".`,
        resourceType: 'conversation',
        resourceId: conversationId,
      });
    } catch (err) {
      this.logger.warn(`Failed to notify user ${targetUserId} of revoked access: ${err}`);
    }

    return { success: true };
  }

  async leaveSharedConversation(
    userId: string,
    conversationId: string,
  ): Promise<{ success: boolean }> {
    if (!Types.ObjectId.isValid(conversationId)) {
      throw new BadRequestException('Invalid conversation ID');
    }

    await this.shareModel.deleteOne({
      conversationId: new Types.ObjectId(conversationId),
      sharedWithUserId: new Types.ObjectId(userId),
    });

    return { success: true };
  }

  async listSharedWithUser(userId: string): Promise<ISharedConversationItem[]> {
    const shares = await this.shareModel
      .find({ sharedWithUserId: new Types.ObjectId(userId) })
      .populate({
        path: 'conversationId',
        match: { archived: { $ne: true } },
      })
      .populate('ownerId', 'firstName lastName email lastSeenAt')
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    const items: ISharedConversationItem[] = [];

    for (const s of shares) {
      const conv: any = s.conversationId;
      if (!conv) continue; // Deleted or archived conversation

      const owner: any = s.ownerId;
      const ownerId = owner?._id ? owner._id.toString() : s.ownerId?.toString();
      const presence = owner ? this.presenceService.calculatePresence(ownerId, owner.lastSeenAt) : undefined;

      items.push({
        id: conv._id.toString(),
        userId: conv.userId.toString(),
        title: conv.title,
        collectionId: conv.collectionId ? conv.collectionId.toString() : null,
        attachedResourceIds: conv.attachedResourceIds || [],
        activeScope: conv.activeScope ? {
          type: conv.activeScope.type,
          id: conv.activeScope.id,
          name: conv.activeScope.name,
          updatedAt: conv.activeScope.updatedAt ? new Date(conv.activeScope.updatedAt).toISOString() : undefined,
        } : undefined,
        pinned: !!conv.pinned,
        archived: !!conv.archived,
        lastMessageAt: conv.lastMessageAt ? new Date(conv.lastMessageAt).toISOString() : undefined,
        createdAt: conv.createdAt ? new Date(conv.createdAt).toISOString() : new Date().toISOString(),
        updatedAt: conv.updatedAt ? new Date(conv.updatedAt).toISOString() : new Date().toISOString(),
        permission: s.permission,
        sharedAt: s.createdAt ? new Date(s.createdAt).toISOString() : new Date().toISOString(),
        owner: owner ? {
          id: ownerId,
          firstName: owner.firstName,
          lastName: owner.lastName,
          email: owner.email,
          presence,
        } : undefined,
      });
    }

    return items;
  }

  async checkUserAccess(
    userId: string,
    conversationId: string,
  ): Promise<{ hasAccess: boolean; isOwner: boolean; permission?: SharePermission }> {
    if (!Types.ObjectId.isValid(conversationId)) {
      return { hasAccess: false, isOwner: false };
    }

    const conv = await this.conversationModel.findById(conversationId).lean().exec();
    if (!conv) {
      return { hasAccess: false, isOwner: false };
    }

    if (conv.userId.toString() === userId) {
      return { hasAccess: true, isOwner: true, permission: 'contribute' };
    }

    const share = await this.shareModel.findOne({
      conversationId: new Types.ObjectId(conversationId),
      sharedWithUserId: new Types.ObjectId(userId),
    });

    if (share) {
      return { hasAccess: true, isOwner: false, permission: share.permission };
    }

    return { hasAccess: false, isOwner: false };
  }
}
