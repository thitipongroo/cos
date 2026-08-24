// PDPA §19 consent decision (ADR-079). Validated with class-validator, never hand-rolled ifs (QM-4).

import { IsBoolean, IsIn, IsString, Matches, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CONSENT_PURPOSES, type ConsentPurposeName } from '../consent/consent.service';

export class RecordConsentDto {
  // Only the CONSENT-basis purposes are accepted. `identity` and `contact` are CONTRACT-based
  // (PDPA §24(3), ADR-079) and have no consent row — posting one would record a decision that
  // contradicts the lawful basis the platform actually relies on, so the enum rejects them at the
  // edge rather than letting the service discover it later.
  @ApiProperty({ enum: CONSENT_PURPOSES, description: 'Processing purpose (consent-basis only)' })
  @IsIn(CONSENT_PURPOSES as unknown as string[])
  purpose!: ConsentPurposeName;

  @ApiProperty({ description: 'true = grant, false = withdraw. Both are recorded as new rows.' })
  @IsBoolean()
  granted!: boolean;

  // The privacy notice the subject actually saw, so PDPA-22 can answer "consented to WHAT".
  // Semver-shaped to match PrivacyPolicyDocument.tsx POLICY_VERSION ('1.0.0'); the column is
  // VARCHAR(32) so MaxLength keeps a long value from reaching the database as a truncation error.
  @ApiProperty({ example: '1.0.0', description: 'Privacy-notice version shown to the user' })
  @IsString()
  @MaxLength(32)
  @Matches(/^\d+\.\d+\.\d+$/, { message: 'notice_version must be semver, e.g. 1.0.0' })
  notice_version!: string;
}
