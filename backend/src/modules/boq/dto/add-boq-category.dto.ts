import { IsString, IsOptional, IsInt, IsUUID, Length, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AddBoqCategoryDto {
  @ApiPropertyOptional({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    description: 'Parent category UUID for hierarchy',
  })
  @IsOptional()
  @IsUUID()
  parent_category_id?: string;

  @ApiProperty({ example: 'STR-01', description: 'Short category code' })
  @IsString()
  @Length(1, 50)
  category_code!: string;

  @ApiProperty({ example: 'Structural Works', description: 'Category display name' })
  @IsString()
  @Length(1, 255)
  category_name!: string;

  @ApiPropertyOptional({ example: 0, description: 'Display sort order' })
  @IsOptional()
  @IsInt()
  @Min(0)
  sort_order?: number;
}
