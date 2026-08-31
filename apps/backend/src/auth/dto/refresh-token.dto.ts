import { IsNotEmpty, IsString } from 'class-validator';
import { IRefreshTokenDto } from '@enter-chat/shared-types';

export class RefreshTokenDto implements IRefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

