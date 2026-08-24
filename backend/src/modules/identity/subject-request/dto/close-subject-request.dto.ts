// Closing a subject request (ADR-090 §5). Validated with class-validator (QM-4).

import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export const SUBJECT_REQUEST_CLOSURES = ['FULFILLED', 'REJECTED'] as const;
export type SubjectRequestClosure = (typeof SUBJECT_REQUEST_CLOSURES)[number];

export class CloseSubjectRequestDto {
  @ApiProperty({ enum: SUBJECT_REQUEST_CLOSURES })
  @IsIn(SUBJECT_REQUEST_CLOSURES as unknown as string[])
  status!: SubjectRequestClosure;

  // REQUIRED on both outcomes, and non-empty. A refusal that does not name its basis is itself a
  // breach — telling a subject their data is "kept for legal reasons" without naming the law, the
  // categories and the period is what regulators treat as the violation (ADR-090 §5). Making the
  // note optional would let the common case be an empty one.
  //
  // MinLength(10) is a floor against "ok" / "done", not a quality bar: no validator can tell a real
  // basis from a plausible sentence, and the DB CHECK `subject_requests_closed_has_outcome` only
  // enforces presence. This is the edge doing what it can.
  @ApiProperty({
    minLength: 10,
    example: 'Anonymised 2 CRM contact rows. Vendor row retained — Revenue Code §87, 7 years.',
    description: 'What was done, or why it was refused, naming the basis.',
  })
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  outcome_note!: string;
}
