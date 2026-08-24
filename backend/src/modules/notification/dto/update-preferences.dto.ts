import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// 24-hour 'HH:MM' — the quiet-hours window edges (§19.6). Stored in the TIME columns
// notifications.notification_preferences.quiet_hours_start / _end.
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class PreferenceItemDto {
  @ApiProperty({ example: 'site.inspection.failed.v1' })
  @IsString()
  @IsNotEmpty()
  event_type!: string;

  @ApiProperty({ enum: ['IN_APP', 'EMAIL', 'LINE', 'SMS'] })
  @IsIn(['IN_APP', 'EMAIL', 'LINE', 'SMS'])
  channel!: string;

  @ApiProperty()
  @IsBoolean()
  is_enabled!: boolean;
}

export class UpdatePreferencesDto {
  // One upsert per entry. The real ceiling is (event types × 4 channels), a few hundred at most, so
  // anything beyond this is a malformed or hostile client rather than a legitimate preference set.
  @ApiProperty({ type: [PreferenceItemDto], maxItems: 500 })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => PreferenceItemDto)
  preferences!: PreferenceItemDto[];

  // Optional quiet-hours window (§19.6). Both must be supplied together to take effect; the service
  // updates the user's stored window only when both are present and valid.
  @ApiPropertyOptional({ example: '22:00' })
  @IsOptional()
  @Matches(HH_MM, { message: 'quiet_hours_start must be HH:MM (00:00–23:59)' })
  quiet_hours_start?: string;

  @ApiPropertyOptional({ example: '07:00' })
  @IsOptional()
  @Matches(HH_MM, { message: 'quiet_hours_end must be HH:MM (00:00–23:59)' })
  quiet_hours_end?: string;
}

export class RegisterDeviceTokenDto {
  @ApiProperty({ example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]' })
  @IsString()
  @IsNotEmpty()
  push_token!: string;

  @ApiProperty({ enum: ['IOS', 'ANDROID', 'WEB'] })
  @IsIn(['IOS', 'ANDROID', 'WEB'])
  platform!: string;
}
