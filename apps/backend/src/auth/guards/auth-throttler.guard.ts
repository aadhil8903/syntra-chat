import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

interface IRateLimitRecord {
  timestamps: number[];
}

@Injectable()
export class AuthThrottlerGuard implements CanActivate {
  private readonly logger = new Logger(AuthThrottlerGuard.name);

  // In-memory sliding-window tracker: key is "ip:endpoint"
  private readonly requestMap = new Map<string, IRateLimitRecord>();

  // Configuration: 10 requests per 60 seconds
  private readonly maxRequests = 10;
  private readonly windowMs = 60 * 1000;

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    const clientIp =
      request.headers['x-forwarded-for']?.toString().split(',')[0].trim() ||
      request.socket?.remoteAddress ||
      request.ip ||
      'unknown-ip';

    const routePath = request.route?.path || request.url || 'auth-route';
    const key = `${clientIp}:${routePath}`;
    const now = Date.now();

    const record = this.requestMap.get(key) || { timestamps: [] };

    // Filter out timestamps outside the sliding window
    record.timestamps = record.timestamps.filter((ts) => now - ts < this.windowMs);

    if (record.timestamps.length >= this.maxRequests) {
      const oldestInWindow = record.timestamps[0];
      const retryAfterSeconds = Math.ceil((oldestInWindow + this.windowMs - now) / 1000);

      this.logger.warn(
        `[RATE_LIMIT_EXCEEDED] clientIp=${clientIp} route=${routePath} attempts=${record.timestamps.length}/${this.maxRequests} retryAfter=${retryAfterSeconds}s`,
      );

      if (response && response.setHeader) {
        response.setHeader('Retry-After', retryAfterSeconds.toString());
      }

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Too many authentication attempts. Please wait ${retryAfterSeconds} seconds before retrying.`,
          retryAfter: retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    record.timestamps.push(now);
    this.requestMap.set(key, record);

    // Set rate limit headers
    if (response && response.setHeader) {
      response.setHeader('X-RateLimit-Limit', this.maxRequests.toString());
      response.setHeader(
        'X-RateLimit-Remaining',
        (this.maxRequests - record.timestamps.length).toString(),
      );
    }

    return true;
  }
}
