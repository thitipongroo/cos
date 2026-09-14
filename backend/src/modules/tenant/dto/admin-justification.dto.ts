import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** Bounds on a SYSTEM_ADMIN justification. §6.7 names no length; these were set in the 2026-09-14 plan. */
export const JUSTIFICATION_MIN = 10;
export const JUSTIFICATION_MAX = 500;

/**
 * The mandatory reason every SYSTEM_ADMIN tenant action carries (§6.7: "All System Admin actions are
 * immutably audit-logged with … a mandatory justification string"; product-owner decision 2026-09-14).
 *
 * Trimmed BEFORE the length check, so ten spaces is not a reason. The minimum exists for the same
 * purpose: "ok" satisfies "required" and tells an auditor nothing.
 */
export class AdminJustificationDto {
  @ApiProperty({
    description: 'Why the operator is taking this action. Stored in platform.audit_logs.metadata.',
    minLength: JUSTIFICATION_MIN,
    maxLength: JUSTIFICATION_MAX,
    example: 'Customer signed the enterprise contract on 2026-09-12 (ticket OPS-4412).',
  })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(JUSTIFICATION_MIN)
  @MaxLength(JUSTIFICATION_MAX)
  justification!: string;
}
