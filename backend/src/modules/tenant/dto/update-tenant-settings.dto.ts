import { IsOptional, IsNumber, Min, Max, IsString, IsBoolean, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateTenantSettingsDto {
  @ApiPropertyOptional({
    description: 'Default budget variance alert threshold (%)',
    minimum: 0,
    maximum: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  variance_alert_threshold?: number;

  @ApiPropertyOptional({
    description: 'Default retention percentage (%)',
    minimum: 0,
    maximum: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  retention_percentage?: number;

  @ApiPropertyOptional({ description: 'LINE Channel Access Token (§19.4)' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  line_channel_token?: string;

  @ApiPropertyOptional({ description: 'Tenant-level notifications enabled' })
  @IsOptional()
  @IsBoolean()
  notifications_enabled?: boolean;
}
