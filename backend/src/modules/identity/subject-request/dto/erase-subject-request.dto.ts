// Options for an erasure (ADR-090 §5). Validated with class-validator (QM-4).

import { IsBoolean, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class EraseSubjectRequestDto {
  /**
   * Keep a pre-anonymisation copy under legal hold.
   *
   * OFF BY DEFAULT, and that default is the point. `data-retention-policy.md` § Legal hold describes
   * a hold as something a person PLACES when a dispute or investigation exists — archiving every
   * erasure would mean the personal data never actually leaves the platform, which is not erasure.
   * The operator asks for it when a hold applies, and says why.
   */
  @ApiPropertyOptional({
    default: false,
    description:
      'Snapshot the matched rows to a file and place a legal hold on it before anonymising.',
  })
  @IsOptional()
  @IsBoolean()
  legal_hold?: boolean;

  // Required WHEN a hold is asked for. A hold with no stated basis is the thing PDPA and GDPR both
  // treat as the breach — "kept for legal reasons" without naming the matter is not an answer — and
  // the reason is what the next reader of `files.files.legal_hold_reason` has to work from.
  @ApiPropertyOptional({
    minLength: 10,
    example: 'Labour Court case 123/2569 — retain until judgment.',
    description: 'Required when legal_hold is true: the dispute or investigation the hold is for.',
  })
  @ValidateIf((dto: EraseSubjectRequestDto) => dto.legal_hold === true)
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  legal_hold_reason?: string;
}
