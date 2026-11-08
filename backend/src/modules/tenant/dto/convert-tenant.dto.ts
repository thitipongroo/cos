import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AdminJustificationDto } from '../public/admin-justification.dto';
import { TRIAL_PLANS, type TrialPlan } from '../public/plan-limits';

/** `PATCH /api/v1/admin/tenants/{tenantId}/convert` (§7.10): the plan the customer paid for, and why. */
export class ConvertTenantDto extends AdminJustificationDto {
  @ApiProperty({
    enum: TRIAL_PLANS,
    example: 'STARTER',
    description:
      'ENTERPRISE is not accepted: it is contracted and provisioned through §34, not converted.',
  })
  @IsIn(TRIAL_PLANS)
  planType!: TrialPlan;
}
