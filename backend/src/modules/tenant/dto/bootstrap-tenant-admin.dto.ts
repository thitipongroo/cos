import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AdminJustificationDto } from '../public/admin-justification.dto';

/**
 * `POST /api/v1/admin/tenants/{tenantId}/tenant-admin` (ADR-110). The first administrator of a tenant that has
 * none: a Path B account (§5.4.4), so an email and a name — no phone number, no role (always TENANT_ADMIN).
 * Rules match `tenantAdminBootstrapSchema` in @cos/schemas, which the web form uses.
 */
export class BootstrapTenantAdminDto extends AdminJustificationDto {
  @ApiProperty({ example: 'somchai@acme.co.th', maxLength: 255 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty({ example: 'สมชาย ใจดี', maxLength: 255 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  display_name!: string;
}
