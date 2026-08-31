import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { IAuthResponse, IJwtPayload } from '@enter-chat/shared-types';
import * as argon2 from 'argon2';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    const nodeEnv = this.configService.get<string>('NODE_ENV');
    const accessSecret = this.configService.get<string>('JWT_ACCESS_SECRET');
    const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET');

    if (nodeEnv === 'production') {
      if (!accessSecret || accessSecret === 'your_super_secret_jwt_access_key_123456789!') {
        throw new Error('FATAL: JWT_ACCESS_SECRET must be configured with a secure random key in production.');
      }
      if (!refreshSecret || refreshSecret === 'your_super_secret_jwt_refresh_key_987654321!') {
        throw new Error('FATAL: JWT_REFRESH_SECRET must be configured with a secure random key in production.');
      }
    }
  }

  async login(loginDto: LoginDto): Promise<IAuthResponse> {
    const userDoc = await this.usersService.findByEmail(loginDto.email);
    if (!userDoc) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await argon2.verify(userDoc.passwordHash, loginDto.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (userDoc.status === 'suspended') {
      throw new UnauthorizedException('Your account has been suspended by an administrator.');
    }

    const user = this.usersService.toIUser(userDoc);
    const tokens = await this.generateTokens(user.id, user.email, user.role);
    await this.usersService.setRefreshTokenHash(user.id, tokens.refreshToken);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user,
    };
  }

  async refreshToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    let payload: IJwtPayload;
    try {
      payload = this.jwtService.verify<IJwtPayload>(refreshToken, {
        secret: this.configService.get<string>(
          'JWT_REFRESH_SECRET',
          'your_super_secret_jwt_refresh_key_987654321!',
        ),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const userDoc = await this.usersService.findDocumentById(payload.sub);
    if (!userDoc || !userDoc.refreshTokenHash) {
      throw new UnauthorizedException('Access denied');
    }

    if (userDoc.status === 'suspended') {
      throw new UnauthorizedException('Your account has been suspended by an administrator.');
    }

    const isMatch = await argon2.verify(userDoc.refreshTokenHash, refreshToken);
    if (!isMatch) {
      throw new UnauthorizedException('Access denied - token mismatch');
    }

    const user = this.usersService.toIUser(userDoc);
    const tokens = await this.generateTokens(user.id, user.email, user.role);
    await this.usersService.setRefreshTokenHash(user.id, tokens.refreshToken);

    return tokens;
  }

  async logout(userId: string): Promise<void> {
    await this.usersService.setRefreshTokenHash(userId, null);
  }

  private async generateTokens(
    userId: string,
    email: string,
    role: any,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const payload: IJwtPayload = { sub: userId, email, role };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>(
          'JWT_ACCESS_SECRET',
          'your_super_secret_jwt_access_key_123456789!',
        ),
        expiresIn: this.configService.get<any>('JWT_ACCESS_EXPIRATION', '15m'),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>(
          'JWT_REFRESH_SECRET',
          'your_super_secret_jwt_refresh_key_987654321!',
        ),
        expiresIn: this.configService.get<any>('JWT_REFRESH_EXPIRATION', '7d'),
      }),
    ]);

    return { accessToken, refreshToken };
  }
}
