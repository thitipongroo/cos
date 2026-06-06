import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class MarkContractedDto {
  @ApiPropertyOptional({
    example: 'CRM-CONTRACT-2026-00142',
    description: 'External contract ID from CRM or contract management system',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  contractReference?: string;
}
