import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AdminJustificationDto } from './admin-justification.dto';

/** Extends the §6.7 justification: marking a tenant contracted is an audited SYSTEM_ADMIN action. */
export class MarkContractedDto extends AdminJustificationDto {
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
