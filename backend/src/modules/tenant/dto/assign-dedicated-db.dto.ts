import { IsString, IsUrl } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssignDedicatedDbDto {
  @ApiProperty({
    example: 'postgresql://user:pass@enterprise-db.example.com:5432/tenantdb',
    description: 'PostgreSQL connection URL for the dedicated database',
  })
  @IsString()
  @IsUrl({ protocols: ['postgresql', 'postgres'], require_tld: false })
  dedicatedDbUrl!: string;
}
