import { IsString, IsOptional, Length, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBoqVersionDto {
  @ApiPropertyOptional({ example: 'Revised estimate Q3', description: 'Optional version name' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  version_name?: string;

  @ApiPropertyOptional({ example: 'THB', description: 'ISO 4217 currency code' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: 'currency_code must be a 3-letter ISO 4217 code' })
  currency_code: string = 'THB';
}
