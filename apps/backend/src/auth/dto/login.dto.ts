import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { ILoginDto } from '@enter-chat/shared-types';

export class LoginDto implements ILoginDto {
  @IsEmail({}, { message: 'Please enter a valid email' })
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

