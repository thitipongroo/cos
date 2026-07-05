import { IsString, IsOptional, MaxLength, IsInt, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Building — §10.2 Physical Objects (naming per §11.2). Created under a project.
export class CreateBuildingDto {
  @ApiProperty({ maxLength: 255, example: 'Tower A' })
  @IsString()
  @MaxLength(255)
  building_name!: string;

  @ApiPropertyOptional({ maxLength: 100, example: 'RESIDENTIAL' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  building_type?: string;

  @ApiPropertyOptional({ example: 30, description: 'Total number of floors' })
  @IsOptional()
  @IsInt()
  @Min(0)
  total_floors?: number;

  @ApiPropertyOptional({ maxLength: 255, example: '13.7563,100.5018' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string;

  @ApiPropertyOptional({ maxLength: 50, example: 'UNDER_CONSTRUCTION' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  status?: string;
}
