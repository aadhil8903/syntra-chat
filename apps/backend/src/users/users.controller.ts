import { Controller, Get, Post, Patch, Delete, Body, UseGuards, Param, BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CurrentUser } from '../permissions/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { IUser, UserRole, ICreateUserResult } from '@enter-chat/shared-types';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getProfile(@CurrentUser() user: IUser): Promise<IUser> {
    return this.usersService.findById(user.id);
  }

  @Patch('me')
  async updateProfile(
    @CurrentUser('id') userId: string,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<IUser> {
    return this.usersService.updateProfile(userId, updateUserDto);
  }

  @Patch('me/onboarding')
  async completeOnboarding(@CurrentUser('id') userId: string): Promise<IUser> {
    return this.usersService.completeOnboarding(userId);
  }

  @Patch('me/password')
  async changePassword(
    @CurrentUser('id') userId: string,
    @Body() changePasswordDto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    return this.usersService.changePassword(userId, changePasswordDto);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  async getAllUsers(): Promise<IUser[]> {
    return this.usersService.findAll();
  }

  @Post()
  @Roles(UserRole.ADMIN)
  async createUser(
    @CurrentUser('id') currentUserId: string,
    @Body() createUserDto: any,
  ): Promise<ICreateUserResult> {
    return this.usersService.createUserByAdmin(createUserDto, currentUserId);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  async updateUser(
    @CurrentUser('id') currentUserId: string,
    @Param('id') id: string,
    @Body() updateUserDto: any,
  ): Promise<IUser> {
    if (id === currentUserId && updateUserDto.status === 'suspended') {
      throw new BadRequestException('You cannot suspend your own account.');
    }
    return this.usersService.update(id, updateUserDto, currentUserId);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  async deleteUser(
    @CurrentUser('id') currentUserId: string,
    @Param('id') id: string,
  ): Promise<{ success: boolean }> {
    if (id === currentUserId) {
      throw new BadRequestException('You cannot delete your own account.');
    }
    await this.usersService.deleteUser(id);
    return { success: true };
  }
}

