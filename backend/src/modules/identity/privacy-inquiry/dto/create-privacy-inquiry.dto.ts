// An inquiry lodged from the PRE-AUTH Privacy Policy screen (ADR-091).
// Validated with class-validator, never hand-rolled ifs (QM-4).
//
// EVERY FIELD HERE ARRIVES FROM AN UNAUTHENTICATED STRANGER, so the caps are not cosmetic: they are
// the only thing bounding a publicly writable table. They mirror the column widths in
// 20260817000001_privacy_inquiries so a value that passes validation always fits, and the message cap
// is what stops the endpoint being free storage.

import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const PRIVACY_INQUIRY_CATEGORIES = [
  'GENERAL',
  'DATA_ACCESS',
  'DATA_CORRECTION',
  'DATA_DELETION',
  'SECURITY_CONCERN',
] as const;
export type PrivacyInquiryCategoryName = (typeof PRIVACY_INQUIRY_CATEGORIES)[number];

export class CreatePrivacyInquiryDto {
  @ApiProperty({ description: 'Name the sender gave. UNVERIFIED — they have no account here.' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  full_name!: string;

  // @IsEmail, not @IsString: this is the only way back to the sender. A reply that cannot be
  // delivered makes the whole record useless, and PDPA §37(3) is about a channel that actually
  // reaches. Syntax is all that can be checked without sending — no confirmation step is imposed,
  // because demanding one before accepting a rights request is over-verification (Art 12(2)/12(6)).
  @ApiProperty({ description: 'Address a reply goes to.' })
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiPropertyOptional({ description: 'Optional, exactly as the form marks it.' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional({
    enum: PRIVACY_INQUIRY_CATEGORIES,
    description: 'Defaults to GENERAL when the sender does not choose.',
  })
  @IsOptional()
  @IsIn(PRIVACY_INQUIRY_CATEGORIES as unknown as string[])
  category?: PrivacyInquiryCategoryName;

  @ApiProperty({ description: 'One-line summary of the request.' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  subject!: string;

  // 5,000 characters. Long enough for someone to describe a data-protection concern in full — the
  // thing this endpoint exists to receive — and short enough that the table cannot be filled with one
  // request. The DB column is TEXT, so this cap is the only bound.
  @ApiProperty({ description: 'The request in the sender’s own words.' })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  message!: string;
}
