import { IsUUID, IsDateString, IsOptional, IsNumber, Min, Max, IsIn } from 'class-validator';

/** §32.4 row 9 CheckinMethod — the symbols the event schema accepts, nothing more. */
export const CHECKIN_METHODS = ['QR_CODE', 'GPS', 'BIOMETRIC', 'MANUAL'] as const;
export type CheckinMethod = (typeof CHECKIN_METHODS)[number];

export class RecordAttendanceDto {
  @IsUUID()
  project_id!: string;

  /**
   * How the check-in was captured. Optional for backward compatibility — no client sends it today —
   * and absent means MANUAL, the one symbol that is TRUE of a request that arrived with no capture
   * method attached. Inferring GPS from the presence of coordinates would read better and claim
   * something the request never said.
   */
  @IsOptional()
  @IsIn(CHECKIN_METHODS as unknown as string[])
  method?: CheckinMethod;

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
}
