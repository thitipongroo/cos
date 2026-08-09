import { IsString, IsEmail, IsOptional, MaxLength, IsNotEmpty, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VENDOR_CATEGORIES, VENDOR_VERIFICATION_STATUSES } from '../vendor-classification';

export class CreateVendorDto {
  @ApiProperty({ maxLength: 50 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  vendor_code!: string;

  @ApiProperty({ maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  vendor_name!: string;

  @ApiPropertyOptional({
    maxLength: 100,
    description: 'Tax ID — stored as-is, no validation (multi-country format)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  tax_id?: string;

  @ApiPropertyOptional({ format: 'email' })
  @IsOptional()
  @IsEmail()
  contact_email?: string;

  @ApiPropertyOptional({ maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  contact_phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  // Omitted ⇒ NULL, which reads as "not categorised yet" rather than a wrong guess at what the
  // vendor supplies. The directory shows those under no category chip.
  @ApiPropertyOptional({
    enum: VENDOR_CATEGORIES,
    description: 'What the vendor supplies — directory browsing only, NOT a tax classification',
  })
  @IsOptional()
  @IsIn(VENDOR_CATEGORIES as unknown as string[])
  category?: (typeof VENDOR_CATEGORIES)[number];

  // Omitted ⇒ NULL = never submitted for review. A new vendor is not silently 'PENDING': that would
  // claim it is sitting in a review queue nobody has actually put it in.
  @ApiPropertyOptional({
    enum: VENDOR_VERIFICATION_STATUSES,
    description: 'Document-check state only — NOT a performance rating (that is the vendor score)',
  })
  @IsOptional()
  @IsIn(VENDOR_VERIFICATION_STATUSES as unknown as string[])
  verification_status?: (typeof VENDOR_VERIFICATION_STATUSES)[number];
}
