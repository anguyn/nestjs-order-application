import {
  Controller,
  Get,
  Put,
  Delete,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '@shared/guards/jwt-auth.guard';
import { Permissions } from '@shared/decorators/permissions.decorator';
import { Permission } from '@shared/constants/permissions.constant';
import { CurrentUser, GetLanguage } from '@shared/decorators/user.decorator';
import type { AuthenticatedUser } from '@shared/types/common.types';
import {
  UpdateProfileDto,
  UpdateUserRoleDto,
  UpdateUserPermissionsDto,
  ToggleUserStatusDto,
  AdminChangePasswordDto,
  QueryUsersDto,
} from './dto/users.dto';
import { ChangePasswordDto } from '../auth/dto/auth.dto';

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Permissions(Permission.USER_READ_ALL)
  @ApiOperation({ summary: 'Get all users (Admin)' })
  @ApiResponse({ status: 200, description: 'Users retrieved successfully' })
  async getAllUsers(
    @Query() query: QueryUsersDto,
    @GetLanguage() lang: string,
  ) {
    return this.usersService.getAllUsers(query, lang);
  }

  @Get('profile')
  @Permissions(Permission.USER_READ)
  @ApiOperation({ summary: 'Get own profile' })
  @ApiResponse({ status: 200, description: 'Profile retrieved successfully' })
  async getProfile(
    @CurrentUser() user: AuthenticatedUser,
    @GetLanguage() lang: string,
  ) {
    return this.usersService.getUserById(user.id, lang);
  }

  @Put('profile')
  @Permissions(Permission.USER_READ)
  @ApiOperation({ summary: 'Update own profile' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  async updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
    @GetLanguage() lang: string,
  ) {
    return this.usersService.updateProfile(user.id, dto, lang);
  }

  @Post('password')
  @HttpCode(HttpStatus.OK)
  @Permissions(Permission.USER_READ)
  @ApiOperation({ summary: 'Change own password' })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @GetLanguage() lang: string,
  ) {
    await this.usersService.changePassword(
      user.id,
      dto.currentPassword,
      dto.newPassword,
      lang,
    );
    return { message: 'Password changed successfully' };
  }

  @Get(':userId')
  @Permissions(Permission.USER_READ_ALL)
  @ApiOperation({ summary: 'Get user by ID (Admin)' })
  @ApiResponse({ status: 200, description: 'User retrieved successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserById(
    @Param('userId') userId: string,
    @GetLanguage() lang: string,
  ) {
    return this.usersService.getUserById(userId, lang);
  }

  @Put(':userId/role')
  @Permissions(Permission.USER_UPDATE)
  @ApiOperation({ summary: 'Update user role (Admin)' })
  @ApiResponse({ status: 200, description: 'Role updated successfully' })
  async updateUserRole(
    @Param('userId') userId: string,
    @Body() dto: UpdateUserRoleDto,
    @GetLanguage() lang: string,
  ) {
    return this.usersService.updateUserRole(userId, dto, lang);
  }

  @Put(':userId/permissions')
  @Permissions(Permission.USER_UPDATE)
  @ApiOperation({ summary: 'Update user permissions (Admin)' })
  @ApiResponse({ status: 200, description: 'Permissions updated successfully' })
  async updateUserPermissions(
    @Param('userId') userId: string,
    @Body() dto: UpdateUserPermissionsDto,
    @GetLanguage() lang: string,
  ) {
    return this.usersService.updateUserPermissions(userId, dto, lang);
  }

  @Put(':userId/status')
  @Permissions(Permission.USER_UPDATE)
  @ApiOperation({ summary: 'Activate/Deactivate user (Admin)' })
  @ApiResponse({ status: 200, description: 'Status updated successfully' })
  async toggleUserStatus(
    @Param('userId') userId: string,
    @Body() dto: ToggleUserStatusDto,
    @GetLanguage() lang: string,
  ) {
    return this.usersService.toggleUserStatus(userId, dto, lang);
  }

  @Post(':userId/password')
  @HttpCode(HttpStatus.OK)
  @Permissions(Permission.USER_UPDATE)
  @ApiOperation({ summary: 'Change user password (Admin)' })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  async adminChangePassword(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body() dto: AdminChangePasswordDto,
    @GetLanguage() lang: string,
  ) {
    if (currentUser.id === userId) {
      throw new ForbiddenException('Cannot change your own password as admin');
    }

    await this.usersService.adminChangePassword(userId, dto, lang);
    return { message: 'Password changed successfully' };
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.OK)
  @Permissions(Permission.USER_DELETE)
  @ApiOperation({ summary: 'Delete user (Admin)' })
  @ApiResponse({ status: 200, description: 'User deleted successfully' })
  async deleteUser(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('userId') userId: string,
    @GetLanguage() lang: string,
  ) {
    if (currentUser.id === userId) {
      throw new ForbiddenException('Cannot delete yourself');
    }

    await this.usersService.deleteUser(userId, lang);
    return { message: 'User deleted successfully' };
  }
}
