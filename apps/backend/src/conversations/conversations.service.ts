import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Types, Connection } from 'mongoose';
import { ConversationEntity, ConversationEntityDocument } from './schemas/conversation.schema';
import {
  IConversation,
  ICreateConversationDto,
  IUpdateConversationDto,
} from '@enter-chat/shared-types';
import { OwnershipService } from '../permissions/services/ownership.service';

@Injectable()
export class ConversationsService {
  constructor(
    @InjectModel(ConversationEntity.name)
    private readonly conversationModel: Model<ConversationEntityDocument>,
    @InjectConnection()
    private readonly connection: Connection,
    private readonly ownershipService: OwnershipService,
  ) {}

  async create(userId: string, dto: ICreateConversationDto): Promise<IConversation> {
    let attached = dto.attachedResourceIds || [];
    if (attached.length > 0) {
      await this.ownershipService.validateUserResources(userId, attached);
    }

    const conversation = new this.conversationModel({
      userId: new Types.ObjectId(userId),
      title: dto.title || 'New Conversation',
      collectionId: dto.collectionId && Types.ObjectId.isValid(dto.collectionId) ? new Types.ObjectId(dto.collectionId) : undefined,
      attachedResourceIds: attached,
    });

    const saved = await conversation.save();
    return this.toIConversation(saved);
  }

  async findAllByUser(userId: string): Promise<IConversation[]> {
    const convs = await this.conversationModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ updatedAt: -1 })
      .exec();

    return convs.map((c) => this.toIConversation(c));
  }

  async search(userId: string, query: string): Promise<IConversation[]> {
    const trimmed = (query || '').trim();
    if (!trimmed) {
      return this.findAllByUser(userId);
    }

    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');

    // Strict keyword match on chat title only
    const matchedConvs = await this.conversationModel
      .find({
        userId: new Types.ObjectId(userId),
        title: { $regex: regex },
      })
      .sort({ updatedAt: -1 })
      .exec();

    return matchedConvs.map((c) => this.toIConversation(c));
  }

  async findOneByUser(userId: string, conversationId: string): Promise<IConversation> {
    if (!Types.ObjectId.isValid(conversationId)) {
      throw new NotFoundException('Conversation not found');
    }

    const conv = await this.conversationModel.findOne({
      _id: new Types.ObjectId(conversationId),
      userId: new Types.ObjectId(userId),
    });

    if (!conv) {
      throw new NotFoundException('Conversation not found');
    }

    return this.toIConversation(conv);
  }

  async update(
    userId: string,
    conversationId: string,
    dto: IUpdateConversationDto,
  ): Promise<IConversation> {
    if (!Types.ObjectId.isValid(conversationId)) {
      throw new NotFoundException('Conversation not found');
    }

    if (dto.attachedResourceIds && dto.attachedResourceIds.length > 0) {
      await this.ownershipService.validateUserResources(userId, dto.attachedResourceIds);
    }

    const updateData: any = {};
    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.collectionId !== undefined) {
      updateData.collectionId = dto.collectionId && Types.ObjectId.isValid(dto.collectionId)
        ? new Types.ObjectId(dto.collectionId)
        : null;
    }
    if (dto.attachedResourceIds !== undefined) updateData.attachedResourceIds = dto.attachedResourceIds;

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

    // Delete associated messages
    const messagesCollection = this.connection.collection('messages');
    await messagesCollection.deleteMany({
      conversationId: new Types.ObjectId(conversationId),
      userId: new Types.ObjectId(userId),
    });
  }

  toIConversation(doc: ConversationEntityDocument): IConversation {
    return {
      id: doc._id.toString(),
      userId: doc.userId.toString(),
      title: doc.title,
      collectionId: doc.collectionId ? doc.collectionId.toString() : null,
      attachedResourceIds: doc.attachedResourceIds || [],
      lastMessageAt: doc.lastMessageAt?.toISOString(),
      createdAt: doc.createdAt?.toISOString() || new Date().toISOString(),
      updatedAt: doc.updatedAt?.toISOString() || new Date().toISOString(),
    };
  }
}

