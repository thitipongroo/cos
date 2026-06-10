// User Controller — Phase 2 (gap closure)
// TENANT_ADMIN manages users within their own tenant.
// Source: spec §14.3 User Management APIs, §6.4.

import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Roles } from '@cos/rbac';
import { CosRole } from '@cos/types';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { ChangeRoleDto } from './dto/change-role.dto';
import type { TenantRequest } from './tenant.middleware';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(CosRole.TENANT_ADMIN)
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @ApiOperation({ summary: 'List all active users in the tenant (TENANT_ADMIN only)' })
  @ApiResponse({ status: 200, description: 'Paginated user list with roles' })
  async list(
    @Req() req: TenantRequest,
    @Query('limit') limitStr?: string,
    @Query('offset') offsetStr?: string,
  ) {
    const limit = Math.min(Math.max(parseInt(limitStr ?? '50', 10) || 50, 1), 200);
    const offset = Math.max(parseInt(offsetStr ?? '0', 10) || 0, 0);
    return this.userService.listUsers(req.tenantId!, { limit, offset });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a user within the tenant (TENANT_ADMIN only)',
    description:
      'Path A (phone): provide phone_number. ' +
      'Path B (email/Keycloak): provide email. ' +
      'Emits identity.user.created.v1.',
  })
  @ApiResponse({ status: 201, description: 'User created' })
  @ApiResponse({ status: 400, description: 'phone_number or email required (not both)' })
  @ApiResponse({ status: 409, description: 'User with this identity already exists' })
  async create(@Body() dto: CreateUserDto, @Req() req: TenantRequest) {
    return this.userService.createUser(dto, req.tenantId!, req.userId ?? 'system');
  }

  @Patch(':userId/role')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Change a user's role within the tenant (TENANT_ADMIN only)",
    description: 'Emits identity.user.role_changed.v1.',
  })
  @ApiResponse({ status: 204, description: 'Role updated' })
  @ApiResponse({ status: 404, description: 'User not found in tenant' })
  async changeRole(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: ChangeRoleDto,
    @Req() req: TenantRequest,
  ) {
    await this.userService.changeRole(userId, dto, req.tenantId!, req.userId ?? 'system');
  }

  @Patch(':userId/deactivate')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Deactivate a user — revokes access, preserves data (TENANT_ADMIN only)',
  })
  @ApiResponse({ status: 204, description: 'User deactivated' })
  @ApiResponse({ status: 404, description: 'User not found or already inactive' })
  async deactivate(@Param('userId', ParseUUIDPipe) userId: string, @Req() req: TenantRequest) {
    await this.userService.deactivateUser(userId, req.tenantId!, req.userId ?? 'system');
  }
}
