import { IsArray, IsEnum, ArrayUnique } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CosRole } from '@cos/types';

// Multi-role assignment: a primary role (platform.tenant_memberships) plus any additional roles the
// user also holds (platform.user_additional_roles). Effective permissions = union of ROLE_PERMISSIONS.
export class SetRolesDto {
  @ApiProperty({
    enum: Object.values(CosRole),
    description: 'Primary role (tenant_memberships.role)',
  })
  @IsEnum(CosRole)
  primary_role!: CosRole;

  @ApiProperty({
    enum: Object.values(CosRole),
    isArray: true,
    description: 'Additional roles held alongside the primary (union). May be empty.',
  })
  @IsArray()
  @IsEnum(CosRole, { each: true })
  @ArrayUnique()
  additional_roles!: CosRole[];
}
