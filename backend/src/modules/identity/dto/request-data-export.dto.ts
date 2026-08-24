// PDPA §30/§31 export request (ADR-078). Validated with class-validator, never hand-rolled ifs (QM-4).

import {
  ArrayNotEmpty,
  ArrayUnique,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PDPA_CATEGORIES, type PdpaCategory } from '../consent/consent.service';

export const EXPORT_FORMATS = ['JSON', 'CSV'] as const;

export class RequestDataExportDto {
  // The platform's own @pdpa taxonomy (migration 20260803000001), not the mockup's invented list —
  // shared with ConsentService so the two features can never disagree about what a category is.
  //
  // ArrayUnique because a repeated category would collect and serialise the same tables twice, and
  // the duplicate would land in the archive as a silently doubled section rather than an error.
  @ApiProperty({
    enum: PDPA_CATEGORIES,
    isArray: true,
    description: 'Which @pdpa categories to export. At least one.',
  })
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsIn(PDPA_CATEGORIES as unknown as string[], { each: true })
  categories!: PdpaCategory[];

  @ApiProperty({
    enum: EXPORT_FORMATS,
    description: 'JSON keeps types; CSV is one file per table.',
  })
  @IsIn(EXPORT_FORMATS as unknown as string[])
  format!: (typeof EXPORT_FORMATS)[number];

  // Optional window. Absent = the complete record, which is what PDPA §30 entitles the subject to;
  // the bounds exist so a person chasing one incident is not handed years of attendance logs.
  @ApiPropertyOptional({ example: '2026-01-01', description: 'Inclusive start of the window' })
  @IsOptional()
  @IsDateString()
  from_date?: string;

  @ApiPropertyOptional({ example: '2026-06-30', description: 'Inclusive end of the window' })
  @IsOptional()
  @IsDateString()
  to_date?: string;

  // Proof the person re-verified just now (StepUpService). Not a session token and never exchangeable
  // for one: it is bound to this user AND to the 'data-export' action, and is spent on first use.
  @ApiProperty({ description: 'Single-use action token from POST /auth/step-up/verify' })
  @IsString()
  action_token!: string;
}
