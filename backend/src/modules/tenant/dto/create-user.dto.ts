import {
  IsString,
  IsEnum,
  IsOptional,
  IsEmail,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CosRole, CosSubRole } from '@cos/types';

export class CreateUserDto {
  @ApiProperty({ example: 'สมชาย ใจดี', description: 'Full display name' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  display_name!: string;

  @ApiProperty({ enum: [...Object.values(CosRole), ...Object.values(CosSubRole)] })
  @IsEnum({ ...CosRole, ...CosSubRole })
  role!: CosRole | CosSubRole;

  // Path A — SITE_WORKER / SITE_ENGINEER: phone number is the identity key
  @ApiPropertyOptional({
    example: '+66812345678',
    description:
      'E.164 format. Required for Path A (phone/OTP) users. Mutually exclusive with email.',
  })
  @IsOptional()
  @Matches(/^\+[1-9]\d{7,14}$/, {
    message: 'phone_number must be E.164 format (e.g. +66812345678)',
  })
  phone_number?: string;

  // Path B — office roles: email is the identity key
  @ApiPropertyOptional({
    example: 'wichai@acmecorp.co.th',
    description:
      'Required for Path B (email/Keycloak) users. Mutually exclusive with phone_number.',
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  // Optional: caller may provide the Keycloak UUID for Path B users.
  // If omitted, email is stored as keycloak_user_id (placeholder — Keycloak provisioning deferred).
  @ApiPropertyOptional({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    description:
      'Keycloak user UUID for Path B users. If omitted, deferred to Keycloak Admin provisioning.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  keycloak_user_id?: string;
}
