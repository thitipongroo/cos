import { IsUUID, IsDateString, IsOptional, IsNumber, IsIn, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * §32.4 row 9 `CheckinMethod` — the symbols the event schema accepts, nothing more.
 *
 * The wire schema owns this set: a value here that the schema does not know would fail Avro
 * encoding in the outbox poller rather than at the API edge.
 *
 * Absent means NOT RECORDED, which is different from `MANUAL` ("a person typed this in"). Deriving
 * GPS from the presence of coordinates was considered and rejected: it would produce a value a
 * consumer could not tell apart from one the client actually asserted.
 */
export const CHECKIN_METHODS = ['QR_CODE', 'GPS', 'BIOMETRIC', 'MANUAL'] as const;
export type CheckinMethod = (typeof CHECKIN_METHODS)[number];

export class RecordAttendanceDto {
  @IsUUID()
  project_id!: string;

  @IsOptional()
  @IsDateString()
  check_in_at?: string;

  @IsOptional()
  @IsDateString()
  check_out_at?: string;

  @IsOptional()
  @IsNumber()
  hours_worked?: number;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiPropertyOptional({
    enum: CHECKIN_METHODS,
    description: 'How the check-in was captured. Omit when the client cannot tell.',
  })
  @IsOptional()
  @IsIn(CHECKIN_METHODS)
  method?: CheckinMethod;
}
