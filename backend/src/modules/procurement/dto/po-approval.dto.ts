import { IsEnum, IsString, IsNotEmpty, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * PO approval-chain tiers — master:1513-1517 (source: spec §15.5).
 *
 *   <= 50,000 THB        PM alone
 *   50,001 - 500,000     PM + FINANCE
 *   > 500,000            PM + FINANCE + EXECUTIVE
 *   all tiers            48h timeout per approver, final escalation to TENANT_ADMIN
 *
 * Declared as an enum rather than a union in a `@Body()` annotation so ValidationPipe has a CLASS to
 * work on. The controller previously typed these bodies inline; a type is erased at runtime, so
 * nothing validated them — a request with no body reached `body.tier` and threw TypeError, which
 * left the caller a 500 instead of a 400, and any string at all was forwarded to the workflow signal.
 */
export enum PoApprovalTier {
  PM = 'PM',
  FINANCE = 'FINANCE',
  EXECUTIVE = 'EXECUTIVE',
  TENANT_ADMIN = 'TENANT_ADMIN',
}

export class ApprovePoDto {
  @ApiProperty({ enum: PoApprovalTier, description: 'Approval tier this approver acts for' })
  @IsEnum(PoApprovalTier)
  tier!: PoApprovalTier;
}

/** PENDING_APPROVAL → DRAFT (master:1519). The reason is what the reviser reads. */
export class RejectPoDto {
  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason!: string;
}

/** INVOICED → DISPUTED (master:1510). */
export class DisputeInvoiceDto {
  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason!: string;
}

/** RFQ award — the quotation that wins. */
export class AwardRfqDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  quotation_id!: string;
}
