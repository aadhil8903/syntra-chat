import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CollectionEntity, CollectionEntityDocument } from './schemas/collection.schema';
import { ConversationEntity, ConversationEntityDocument } from '../conversations/schemas/conversation.schema';
import { ICollection } from '@enter-chat/shared-types';

@Injectable()
export class CollectionsService {
  constructor(
    @InjectModel(CollectionEntity.name)
    private readonly collectionModel: Model<CollectionEntityDocument>,
    @InjectModel(ConversationEntity.name)
    private readonly conversationModel: Model<ConversationEntityDocument>,
  ) {}

  async create(userId: string, name: string): Promise<ICollection> {
    const trimmed = (name || '').trim();
    if (!trimmed) {
      throw new BadRequestException('Collection name cannot be empty');
    }

    const col = new this.collectionModel({
      userId: new Types.ObjectId(userId),
      name: trimmed,
      sharedMemory: '',
      summaryVersion: 1,
    });

    const saved = await col.save();
    return this.toICollection(saved);
  }

  async findAllByUser(userId: string): Promise<ICollection[]> {
    const list = await this.collectionModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ updatedAt: -1 })
      .exec();

    return list.map((c) => this.toICollection(c));
  }

  async findOneByUser(userId: string, collectionId: string): Promise<ICollection> {
    if (!Types.ObjectId.isValid(collectionId)) {
      throw new NotFoundException('Collection not found');
    }

    const col = await this.collectionModel.findOne({
      _id: new Types.ObjectId(collectionId),
      userId: new Types.ObjectId(userId),
    });

    if (!col) {
      throw new NotFoundException('Collection not found or not accessible');
    }

    return this.toICollection(col);
  }

  async rename(userId: string, collectionId: string, newName: string): Promise<ICollection> {
    if (!Types.ObjectId.isValid(collectionId)) {
      throw new NotFoundException('Collection not found');
    }

    const trimmed = (newName || '').trim();
    if (!trimmed) {
      throw new BadRequestException('Collection name cannot be empty');
    }

    const updated = await this.collectionModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(collectionId),
        userId: new Types.ObjectId(userId),
      },
      { $set: { name: trimmed } },
      { new: true },
    );

    if (!updated) {
      throw new NotFoundException('Collection not found or not accessible');
    }

    return this.toICollection(updated);
  }

  async delete(userId: string, collectionId: string): Promise<void> {
    if (!Types.ObjectId.isValid(collectionId)) {
      throw new NotFoundException('Collection not found');
    }

    const col = await this.collectionModel.findOneAndDelete({
      _id: new Types.ObjectId(collectionId),
      userId: new Types.ObjectId(userId),
    });

    if (!col) {
      throw new NotFoundException('Collection not found or not accessible');
    }

    // Unlink all conversations in this collection so they return to Recent Chats
    await this.conversationModel.updateMany(
      {
        collectionId: new Types.ObjectId(collectionId),
        userId: new Types.ObjectId(userId),
      },
      { $unset: { collectionId: 1 } },
    );
  }

  async moveConversation(
    userId: string,
    conversationId: string,
    targetCollectionId: string | null,
  ): Promise<void> {
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

    if (targetCollectionId) {
      if (!Types.ObjectId.isValid(targetCollectionId)) {
        throw new BadRequestException('Invalid collection ID');
      }

      // Verify target collection belongs to authenticated user
      const col = await this.collectionModel.findOne({
        _id: new Types.ObjectId(targetCollectionId),
        userId: new Types.ObjectId(userId),
      });

      if (!col) {
        throw new ForbiddenException('Target collection not found or not owned by user');
      }

      conv.collectionId = new Types.ObjectId(targetCollectionId);
    } else {
      (conv as any).collectionId = undefined;
    }

    await conv.save();
  }

  async getSharedMemory(userId: string, collectionId: string): Promise<string> {
    if (!Types.ObjectId.isValid(collectionId)) return '';
    const col = await this.collectionModel.findOne({
      _id: new Types.ObjectId(collectionId),
      userId: new Types.ObjectId(userId),
    });
    return col?.sharedMemory || '';
  }

  async updateSharedMemory(
    userId: string,
    collectionId: string,
    newFactOrTurn: string,
  ): Promise<void> {
    if (!Types.ObjectId.isValid(collectionId) || !newFactOrTurn.trim()) return;

    const col = await this.collectionModel.findOne({
      _id: new Types.ObjectId(collectionId),
      userId: new Types.ObjectId(userId),
    });

    if (!col) return;

    // Bounded shared memory maintenance (max ~1500 chars)
    let currentMemory = col.sharedMemory || '';
    const cleanedFact = newFactOrTurn.replace(/[\r\n]+/g, ' ').trim();

    if (!cleanedFact) return;

    // Avoid duplicate facts
    if (currentMemory.includes(cleanedFact)) return;

    let updatedMemory = currentMemory ? currentMemory + '\n• ' + cleanedFact : '• ' + cleanedFact;

    // Compact if exceeds 1500 characters
    if (updatedMemory.length > 1500) {
      const lines = updatedMemory.split('\n');
      // Retain most recent ~15 bullets
      updatedMemory = lines.slice(-15).join('\n');
    }

    await this.collectionModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(collectionId),
        userId: new Types.ObjectId(userId),
      },
      {
        $set: { sharedMemory: updatedMemory },
        $inc: { summaryVersion: 1 },
      },
    );
  }

  toICollection(doc: CollectionEntityDocument): ICollection {
    return {
      id: doc._id.toString(),
      userId: doc.userId.toString(),
      name: doc.name,
      sharedMemory: doc.sharedMemory || '',
      summaryVersion: doc.summaryVersion || 1,
      createdAt: doc.createdAt?.toISOString() || new Date().toISOString(),
      updatedAt: doc.updatedAt?.toISOString() || new Date().toISOString(),
    };
  }
}
