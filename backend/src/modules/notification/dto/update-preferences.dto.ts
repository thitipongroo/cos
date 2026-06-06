import { IsArray, IsBoolean, IsIn, IsNotEmpty, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

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
  @ApiProperty({ type: [PreferenceItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PreferenceItemDto)
  preferences!: PreferenceItemDto[];
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
