import { Injectable, Logger } from '@nestjs/common';
import { Response } from 'express';
import { IMessage } from '@enter-chat/shared-types';

@Injectable()
export class MessagesEventsService {
  private readonly logger = new Logger(MessagesEventsService.name);
  private readonly clients = new Map<string, Set<Response>>();

  registerClient(userId: string, res: Response): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const isFirstConnection = !this.clients.has(userId) || this.clients.get(userId)!.size === 0;

    if (!this.clients.has(userId)) {
      this.clients.set(userId, new Set<Response>());
    }
    const userClients = this.clients.get(userId)!;
    userClients.add(res);

    this.logger.log(`[SSE] User connected: ${userId}. Total active connections for user: ${userClients.size}`);

    // Send connected handshake event
    res.write(`event: connected\ndata: ${JSON.stringify({ userId, timestamp: new Date().toISOString() })}\n\n`);

    // Broadcast immediate online presence to all active clients if first connection
    if (isFirstConnection) {
      this.broadcastPresenceUpdate(userId, true, new Date().toISOString());
    }

    // Keep-alive heartbeat every 25 seconds to prevent proxy timeouts
    const interval = setInterval(() => {
      try {
        res.write(`event: ping\ndata: ${JSON.stringify({ time: Date.now() })}\n\n`);
      } catch {
        clearInterval(interval);
      }
    }, 25000);

    res.on('close', () => {
      clearInterval(interval);
      userClients.delete(res);
      if (userClients.size === 0) {
        this.clients.delete(userId);
        // User has disconnected all active tabs -> broadcast offline
        this.broadcastPresenceUpdate(userId, false, new Date().toISOString());
      }
      this.logger.log(`[SSE] User disconnected: ${userId}. Remaining connections: ${userClients.size}`);
    });
  }

  isUserOnline(userId: string): boolean {
    const userConnections = this.clients.get(userId);
    return !!userConnections && userConnections.size > 0;
  }

  broadcastPresenceUpdate(userId: string, isOnline: boolean, lastSeenAt?: string): void {
    const payload = JSON.stringify({
      type: 'presence_update',
      userId,
      isOnline,
      lastSeenAt: lastSeenAt || new Date().toISOString(),
    });

    for (const [uid, userConnections] of this.clients.entries()) {
      userConnections.forEach((res) => {
        try {
          res.write(`event: presence_update\ndata: ${payload}\n\n`);
        } catch (err) {
          this.logger.warn(`Failed to push presence update SSE to user ${uid}: ${err}`);
        }
      });
    }
  }

  broadcastNewMessage(message: IMessage, recipientUserIds: string[]): void {
    const payload = JSON.stringify({
      type: 'new_message',
      message,
      conversationId: message.conversationId,
    });

    for (const uid of recipientUserIds) {
      const userConnections = this.clients.get(uid);
      if (userConnections && userConnections.size > 0) {
        userConnections.forEach((res) => {
          try {
            res.write(`event: new_message\ndata: ${payload}\n\n`);
          } catch (err) {
            this.logger.warn(`Failed to push message SSE to user ${uid}: ${err}`);
          }
        });
      }
    }
  }

  broadcastConversationUpdate(conversationId: string, participantUserIds: string[], update: any): void {
    const payload = JSON.stringify({
      type: 'conversation_updated',
      conversationId,
      update,
    });

    for (const uid of participantUserIds) {
      const userConnections = this.clients.get(uid);
      if (userConnections && userConnections.size > 0) {
        userConnections.forEach((res) => {
          try {
            res.write(`event: conversation_updated\ndata: ${payload}\n\n`);
          } catch (err) {
            this.logger.warn(`Failed to push conversation update SSE to user ${uid}: ${err}`);
          }
        });
      }
    }
  }
}
