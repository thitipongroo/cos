// A subject request raised by someone with NO platform account (ADR-090; PDPA-48).
// Validated with class-validator, never hand-rolled ifs (QM-4).

import { IsIn, IsISO8601, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const SUBJECT_REQUEST_TYPES = ['ACCESS', 'ERASURE'] as const;
export type SubjectRequestTypeName = (typeof SUBJECT_REQUEST_TYPES)[number];

export class CreateSubjectRequestDto {
  @ApiProperty({
    enum: SUBJECT_REQUEST_TYPES,
    description: 'ACCESS covers PDPA §30/§31; ERASURE covers §33.',
  })
  @IsIn(SUBJECT_REQUEST_TYPES as unknown as string[])
  request_type!: SubjectRequestTypeName;

  // At least one identifier, enforced here AND by the DB CHECK `subject_requests_identifier_present`.
  // Both layers are deliberate: without an identifier the row would authorise a search it cannot
  // scope, and a request that authorises an unscoped search is the enumeration surface ADR-090 §4
  // exists to close.
  //
  // `ValidateIf` on the pair is what makes "at least one" expressible in class-validator: each field
  // is optional on its own, and required only when the other is absent.
  @ApiPropertyOptional({ description: 'Email the subject identified themselves by' })
  @ValidateIf((dto: CreateSubjectRequestDto) => !dto.subject_phone)
  @IsString()
  @MaxLength(255)
  subject_email?: string;

  @ApiPropertyOptional({ description: 'Phone the subject identified themselves by' })
  @ValidateIf((dto: CreateSubjectRequestDto) => !dto.subject_email)
  @IsString()
  @MaxLength(50)
  subject_phone?: string;

  // When the TENANT received the request — supplied, never defaulted to now(). PDPA §30 runs 30 days
  // from receipt, which happens off-platform (email, phone) possibly days before an admin keys it in;
  // defaulting it here would silently extend a statutory clock.
  @ApiProperty({
    example: '2026-08-14T09:00:00.000Z',
    description: 'ISO-8601 instant the tenant received the request. Starts the PDPA §30 clock.',
  })
  @IsISO8601()
  received_at!: string;

  @ApiPropertyOptional({
    description: 'Free-text note from the operator (never the subject’s data)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
