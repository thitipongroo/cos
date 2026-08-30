// User self-service Controller — the signed-in user reading/updating their OWN record.
//
// Separate from UserController on purpose: that class carries a class-level @Roles(TENANT_ADMIN)
// for the §14 User Management APIs, and adding `me` routes there would gate a user's own profile
// behind tenant-admin rights. These routes are open to any authenticated role — there is no @Roles,
// only JwtAuthGuard — and every one of them scopes by the JWT's user_id, so a caller can only ever
// reach their own row.
//
// Source: §14 User Management APIs (self-service addition, product-owner decision 2026-07-16),
// §11 platform.users.photo_url.

import { Controller, Get, Patch, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { UserService } from './user.service';
import { UpdateMyPhotoDto } from './dto/update-my-photo.dto';
import type { TenantRequest } from './tenant.middleware';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UserMeController {
  constructor(private readonly userService: UserService) {}

  // GET /api/v1/users/me
  @Get('me')
  @ApiOperation({ summary: "The signed-in user's own record (any authenticated role)" })
  @ApiResponse({ status: 200, description: 'The caller’s user row, including photo_url' })
  async me(@Req() req: TenantRequest) {
    return this.userService.getMe(req.tenantId!, req.userId!);
  }

  // PATCH /api/v1/users/me/photo
  @Patch('me/photo')
  @ApiOperation({
    summary: "Set or clear the signed-in user's profile photo",
    description:
      'photo_url is a file-service URL — upload the image with POST /api/v1/files/upload first, ' +
      'then send the returned URL here. Send null to clear it and go back to initials.',
  })
  @ApiResponse({ status: 200, description: 'The updated user row' })
  async updatePhoto(@Req() req: TenantRequest, @Body() dto: UpdateMyPhotoDto) {
    return this.userService.updateMyPhoto(req.tenantId!, req.userId!, dto.photo_url ?? null);
  }
}
