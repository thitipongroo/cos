import { IsIn, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// Wraps the previously-unvalidated @Body('status') primitive (security review L3). The service still
// enforces the state-machine transitions; this bounds the input to a known status at the API layer.
export const EQUIPMENT_STATUSES = ['AVAILABLE', 'IN_USE', 'MAINTENANCE', 'RETIRED'] as const;

export class UpdateEquipmentStatusDto {
  @ApiProperty({ enum: EQUIPMENT_STATUSES })
  @IsString()
  @IsIn(EQUIPMENT_STATUSES)
  status!: string;
}
