// Vendor Portal DTOs (ADR-030). Decimal money values are validated as strings (never float).

import { IsEmail, IsInt, IsNotEmpty, IsString, IsUUID, Matches, Max, Min } from 'class-validator';

const DECIMAL = /^\d+(\.\d{1,4})?$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class IssueInvitationDto {
  @IsUUID()
  vendor_id!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  display_name!: string;
}

export class SubmitQuotationDto {
  @Matches(DECIMAL, { message: 'total_amount must be a decimal string' })
  total_amount!: string;

  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: 'currency_code must be a 3-letter ISO code' })
  currency_code!: string;

  @IsInt()
  @Min(1)
  @Max(365)
  validity_days!: number;
}

export class SubmitInvoiceDto {
  @IsUUID()
  po_id!: string;

  @IsString()
  @IsNotEmpty()
  invoice_number!: string;

  @Matches(DECIMAL, { message: 'amount must be a decimal string' })
  amount!: string;

  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: 'currency_code must be a 3-letter ISO code' })
  currency_code!: string;

  @Matches(ISO_DATE, { message: 'invoice_date must be YYYY-MM-DD' })
  invoice_date!: string;

  @Matches(ISO_DATE, { message: 'due_date must be YYYY-MM-DD' })
  due_date!: string;
}
