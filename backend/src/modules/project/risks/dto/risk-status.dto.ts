import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { RiskStatus } from './create-risk.dto';

// Transition a risk's status (ADR-065 / §14): OPEN / MITIGATING / CLOSED / ACCEPTED.
export class RiskStatusDto {
  @ApiProperty({ enum: RiskStatus })
  @IsEnum(RiskStatus)
  status!: RiskStatus;
}
