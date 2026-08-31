import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';
import { IJwtPayload, IUser } from '@enter-chat/shared-types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    const nodeEnv = configService.get<string>('NODE_ENV');
    const secret = configService.get<string>('JWT_ACCESS_SECRET');

    if (nodeEnv === 'production' && (!secret || secret === 'your_super_secret_jwt_access_key_123456789!')) {
      throw new Error('FATAL: JWT_ACCESS_SECRET must be configured with a secure random key in production.');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret || 'your_super_secret_jwt_access_key_123456789!',
    });
  }

  async validate(payload: IJwtPayload): Promise<IUser> {
    const userDoc = await this.usersService.findDocumentById(payload.sub);
    if (!userDoc) {
      throw new UnauthorizedException('User account no longer exists');
    }
    if (userDoc.status === 'suspended') {
      throw new UnauthorizedException('Your account has been suspended by an administrator.');
    }
    return this.usersService.toIUser(userDoc);
  }
}

