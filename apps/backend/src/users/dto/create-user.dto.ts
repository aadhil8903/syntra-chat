import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { IRegisterDto } from '@enter-chat/shared-types';

export class CreateUserDto implements IRegisterDto {
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty()
  email: string;

  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  @IsNotEmpty()
  password: string;

  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;
}

