import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';

describe('AuthService (Unit & Security)', () => {
  let authService: AuthService;
  let usersService: jest.Mocked<any>;
  let jwtService: jest.Mocked<any>;
  let configService: jest.Mocked<any>;

  const mockUserDoc = {
    _id: '507f1f77bcf86cd799439011',
    email: 'user@test.com',
    passwordHash: '',
    role: 'user',
    status: 'active',
    refreshTokenHash: '',
  };

  beforeAll(async () => {
    mockUserDoc.passwordHash = await argon2.hash('ValidPass123!');
    mockUserDoc.refreshTokenHash = await argon2.hash('valid_refresh_token');
  });

  beforeEach(async () => {
    usersService = {
      findByEmail: jest.fn(),
      findDocumentById: jest.fn(),
      toIUser: jest.fn().mockImplementation((doc) => ({
        id: doc._id.toString(),
        email: doc.email,
        role: doc.role,
        status: doc.status,
      })),
      setRefreshTokenHash: jest.fn().mockResolvedValue(undefined),
    };

    jwtService = {
      signAsync: jest.fn().mockResolvedValue('mocked_jwt_token'),
      verify: jest.fn(),
    };

    configService = {
      get: jest.fn().mockImplementation((key, defaultValue) => defaultValue),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
  });

  it('should authenticate valid user and return access and refresh tokens without leaking password hash', async () => {
    usersService.findByEmail.mockResolvedValue(mockUserDoc);

    const result = await authService.login({
      email: 'user@test.com',
      password: 'ValidPass123!',
    });

    expect(result.accessToken).toBe('mocked_jwt_token');
    expect(result.refreshToken).toBe('mocked_jwt_token');
    expect(result.user.email).toBe('user@test.com');
    expect((result as any).password).toBeUndefined();
    expect((result as any).passwordHash).toBeUndefined();
    expect(usersService.setRefreshTokenHash).toHaveBeenCalled();
  });

  it('should reject login when user does not exist', async () => {
    usersService.findByEmail.mockResolvedValue(null);

    await expect(
      authService.login({ email: 'nonexistent@test.com', password: 'password' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should reject login with wrong password', async () => {
    usersService.findByEmail.mockResolvedValue(mockUserDoc);

    await expect(
      authService.login({ email: 'user@test.com', password: 'WrongPassword!' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should reject login for suspended user account', async () => {
    usersService.findByEmail.mockResolvedValue({
      ...mockUserDoc,
      status: 'suspended',
    });

    await expect(
      authService.login({ email: 'user@test.com', password: 'ValidPass123!' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should rotate refresh token on valid refresh request', async () => {
    jwtService.verify.mockReturnValue({ sub: mockUserDoc._id, email: mockUserDoc.email, role: 'user' });
    usersService.findDocumentById.mockResolvedValue(mockUserDoc);

    const tokens = await authService.refreshToken('valid_refresh_token');

    expect(tokens.accessToken).toBe('mocked_jwt_token');
    expect(tokens.refreshToken).toBe('mocked_jwt_token');
    expect(usersService.setRefreshTokenHash).toHaveBeenCalled();
  });

  it('should reject refresh token when token does not match stored hash', async () => {
    jwtService.verify.mockReturnValue({ sub: mockUserDoc._id, email: mockUserDoc.email, role: 'user' });
    usersService.findDocumentById.mockResolvedValue(mockUserDoc);

    await expect(authService.refreshToken('tampered_token')).rejects.toThrow(UnauthorizedException);
  });

  it('should invalidate refresh token on logout', async () => {
    await authService.logout('507f1f77bcf86cd799439011');
    expect(usersService.setRefreshTokenHash).toHaveBeenCalledWith('507f1f77bcf86cd799439011', null);
  });
});
