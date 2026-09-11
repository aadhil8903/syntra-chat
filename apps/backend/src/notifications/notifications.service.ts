import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { NotificationEntity, NotificationDocument } from './schemas/notification.schema';
import { INotification, NotificationType } from '@enter-chat/shared-types';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(NotificationEntity.name)
    private readonly notificationModel: Model<NotificationDocument>,
  ) {}

  async createNotification(params: {
    userId: string;
    senderId?: string;
    type: NotificationType;
    title: string;
    message: string;
    resourceType: 'conversation' | 'message';
    resourceId: string;
  }): Promise<INotification> {
    const doc = await this.notificationModel.create({
      userId: new Types.ObjectId(params.userId),
      senderId: params.senderId ? new Types.ObjectId(params.senderId) : undefined,
      type: params.type,
      title: params.title,
      message: params.message,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      isRead: false,
    });

    return this.toINotification(doc);
  }

  async getUserNotifications(userId: string, limit = 30): Promise<INotification[]> {
    const docs = await this.notificationModel
      .find({ userId: new Types.ObjectId(userId) })
      .populate('senderId', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();

    return docs.map((doc: any) => ({
      id: doc._id.toString(),
      userId: doc.userId.toString(),
      senderId: doc.senderId?._id ? doc.senderId._id.toString() : doc.senderId?.toString(),
      sender: doc.senderId && typeof doc.senderId === 'object' && doc.senderId.firstName ? {
        id: doc.senderId._id.toString(),
        firstName: doc.senderId.firstName,
        lastName: doc.senderId.lastName,
        email: doc.senderId.email,
      } : undefined,
      type: doc.type,
      title: doc.title,
      message: doc.message,
      resourceType: doc.resourceType,
      resourceId: doc.resourceId,
      isRead: doc.isRead,
      createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString(),
    }));
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationModel.countDocuments({
      userId: new Types.ObjectId(userId),
      isRead: false,
    });
  }

  async markAsRead(userId: string, notificationId: string): Promise<{ success: boolean }> {
    await this.notificationModel.updateOne(
      {
        _id: new Types.ObjectId(notificationId),
        userId: new Types.ObjectId(userId),
      },
      { $set: { isRead: true } },
    );
    return { success: true };
  }

  async markAllAsRead(userId: string): Promise<{ success: boolean }> {
    await this.notificationModel.updateMany(
      {
        userId: new Types.ObjectId(userId),
        isRead: false,
      },
      { $set: { isRead: true } },
    );
    return { success: true };
  }

  private toINotification(doc: NotificationDocument): INotification {
    return {
      id: doc._id.toString(),
      userId: doc.userId.toString(),
      senderId: doc.senderId?.toString(),
      type: doc.type,
      title: doc.title,
      message: doc.message,
      resourceType: doc.resourceType,
      resourceId: doc.resourceId,
      isRead: doc.isRead,
      createdAt: doc.createdAt ? doc.createdAt.toISOString() : new Date().toISOString(),
    };
  }
}
