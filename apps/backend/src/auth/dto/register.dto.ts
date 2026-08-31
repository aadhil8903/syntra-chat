import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { IRegisterDto } from '@enter-chat/shared-types';

export class RegisterDto implements IRegisterDto {
  @IsEmail({}, { message: 'Please enter a valid email' })
  @IsNotEmpty()
  email: string;

  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  @IsNotEmpty()
  password: string;

  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;
}

