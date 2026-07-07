import { IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// G-M14 — set the free-text note on a vendor invoice.
export class SetInvoiceNoteDto {
  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @MaxLength(2000)
  note!: string;
}
