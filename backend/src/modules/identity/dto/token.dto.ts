import { IsString, IsNotEmpty, Matches, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// Wraps previously-unvalidated @Body('field') primitives (security review L3) so the global
// ValidationPipe enforces type + length, rather than forwarding an unbounded string to Keycloak/MFA.

export class RefreshTokenDto {
  @ApiProperty({ description: 'Keycloak refresh token (JWT)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  refreshToken!: string;
}

export class MfaTokenDto {
  @ApiProperty({ example: '123456', description: '6-digit TOTP code' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'token must be a 6-digit TOTP code' })
  token!: string;
}
