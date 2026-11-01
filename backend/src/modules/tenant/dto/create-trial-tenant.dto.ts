import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { CreateTenantDto } from './create-tenant.dto';
import { TRIAL_PLANS, type TrialPlan } from '../public/plan-limits';

/**
 * `POST /api/v1/admin/tenants/trial` (§7.10). The create-tenant body without the ENTERPRISE-only dedicated DB,
 * on a trial plan, with where the trial came from. Audited like every SYSTEM_ADMIN action (§6.7).
 */
export class CreateTrialTenantDto extends OmitType(CreateTenantDto, [
  'planType',
  'dedicatedDbUrl',
] as const) {
  @ApiProperty({ enum: TRIAL_PLANS, example: 'STARTER' })
  @IsIn(TRIAL_PLANS)
  planType!: TrialPlan;

  @ApiPropertyOptional({
    description:
      'The construction-os.io CTA the request came from (its `source`), for funnel reporting.',
    example: 'pricing',
    maxLength: 40,
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]{1,40}$/, { message: 'trialSource must be 1-40 chars: a-z, 0-9, hyphen' })
  trialSource?: string;

  @ApiPropertyOptional({
    description:
      "The construction-os.io trial request this tenant was opened from — the website's own key, stored as text.",
    example: '7c0e4d3a-2a51-4c38-9d1e-5f0a6f2b9e11',
    maxLength: 80,
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'trialRequestRef may contain A-Z, a-z, 0-9, _ and - only',
  })
  trialRequestRef?: string;
}
