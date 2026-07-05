import { IsString, IsOptional, MaxLength, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

// Asset — §11.2 (asset/handover domain). Created under a project.
export class CreateAssetDto {
  @ApiPropertyOptional({ maxLength: 100, example: 'HVAC_UNIT' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  asset_type?: string;

  @ApiPropertyOptional({ example: '2027-01-15' })
  @IsOptional()
  @IsDateString()
  handover_date?: string;

  @ApiPropertyOptional({ example: '2032-01-15' })
  @IsOptional()
  @IsDateString()
  warranty_expiry?: string;

  @ApiPropertyOptional({ maxLength: 50, example: 'OPERATIONAL' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  maintenance_status?: string;
}
