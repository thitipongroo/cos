import { IsString, IsUrl } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AdminJustificationDto } from './admin-justification.dto';

/** Extends the §6.7 justification: assigning a dedicated DB is an audited SYSTEM_ADMIN action. */
export class AssignDedicatedDbDto extends AdminJustificationDto {
  @ApiProperty({
    example: 'postgresql://user:pass@enterprise-db.example.com:5432/tenantdb',
    description: 'PostgreSQL connection URL for the dedicated database',
  })
  @IsString()
  @IsUrl({ protocols: ['postgresql', 'postgres'], require_tld: false })
  dedicatedDbUrl!: string;
}
