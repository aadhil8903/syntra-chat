import { Injectable, Logger, Inject, forwardRef, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { IUserPresence, IOrgMember } from '@enter-chat/shared-types';
import { MessagesEventsService } from '../messages/messages-events.service';

@Injectable()
export class PresenceService {
  private readonly logger = new Logger(PresenceService.name);
  private readonly lastHeartbeatMap = new Map<string, number>();
  private readonly ONLINE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
  private readonly HEARTBEAT_DEBOUNCE_MS = 15 * 1000; // debounce 15s to database

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @Optional() @Inject(forwardRef(() => MessagesEventsService)) private readonly messagesEventsService?: MessagesEventsService,
  ) {}

  async recordHeartbeat(userId: string): Promise<{ success: boolean; lastSeenAt: string }> {
    const now = Date.now();
    const lastDbUpdate = this.lastHeartbeatMap.get(userId) || 0;
    const isoDate = new Date(now).toISOString();

    // In-memory update
    this.lastHeartbeatMap.set(userId, now);

    // Broadcast immediate presence update via real-time SSE stream
    try {
      this.messagesEventsService?.broadcastPresenceUpdate(userId, true, isoDate);
    } catch {}

    // Persist to MongoDB if debounce interval has elapsed
    if (now - lastDbUpdate >= this.HEARTBEAT_DEBOUNCE_MS) {
      try {
        await this.userModel.updateOne(
          { _id: new Types.ObjectId(userId) },
          { $set: { lastSeenAt: new Date(now) } },
        );
      } catch (err) {
        this.logger.warn(`Failed to update lastSeenAt for user ${userId}: ${err}`);
      }
    }

    return {
      success: true,
      lastSeenAt: isoDate,
    };
  }

  calculatePresence(userId: string, lastSeenAt?: Date | string | null): IUserPresence {
    const now = Date.now();
    let lastSeenTime = 0;

    // Check memory map first for most immediate value
    if (this.lastHeartbeatMap.has(userId)) {
      lastSeenTime = this.lastHeartbeatMap.get(userId)!;
    } else if (lastSeenAt) {
      lastSeenTime = new Date(lastSeenAt).getTime();
    }

    const isSseConnected = this.messagesEventsService?.isUserOnline(userId) || false;
    const isOnline = isSseConnected || (lastSeenTime > 0 && now - lastSeenTime <= this.ONLINE_THRESHOLD_MS);
    const lastSeenDate = lastSeenTime > 0 ? new Date(lastSeenTime) : (isSseConnected ? new Date(now) : undefined);

    return {
      userId,
      isOnline,
      lastSeenAt: lastSeenDate ? lastSeenDate.toISOString() : undefined,
      lastSeenRelative: lastSeenDate ? this.formatRelativeTime(lastSeenDate) : 'Never',
    };
  }

  async getOrgMembersWithPresence(currentUserId: string, search?: string): Promise<IOrgMember[]> {
    const query: any = {
      isDeleted: { $ne: true },
      status: 'active',
    };

    if (search && search.trim()) {
      const regex = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [
        { firstName: regex },
        { lastName: regex },
        { email: regex },
      ];
    }

    const users = await this.userModel
      .find(query)
      .select('_id email firstName lastName role departments lastSeenAt')
      .sort({ firstName: 1, lastName: 1 })
      .limit(50)
      .lean()
      .exec();

    return users.map((u: any) => {
      const id = u._id.toString();
      const presence = this.calculatePresence(id, u.lastSeenAt);
      return {
        id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
        departments: u.departments || [],
        presence,
      };
    });
  }

  private formatRelativeTime(date: Date): string {
    const diffMs = Date.now() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHr / 24);

    if (diffSec < 60) return 'Just now';
    if (diffMin === 1) return '1 min ago';
    if (diffMin < 60) return `${diffMin} mins ago`;
    if (diffHr === 1) return '1 hour ago';
    if (diffHr < 24) return `${diffHr} hours ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}
