import { IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Unit — §11.2. Created under a building; project_id is derived from the parent building.
export class CreateUnitDto {
  @ApiProperty({ maxLength: 50, example: 'A-1201' })
  @IsString()
  @MaxLength(50)
  unit_number!: string;

  @ApiPropertyOptional({ maxLength: 100, example: '2BR' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  unit_type?: string;

  @ApiPropertyOptional({ maxLength: 50, example: 'AVAILABLE' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  status?: string;
}
