// DTOs for the AR Billing increment (§11 Customer / Contract / Billing / AR Receipt, §15 approval).

import { IsString, IsNotEmpty, IsUUID, IsDateString, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDecimalString } from '@cos/validation';

export class CreateCustomerDto {
  @ApiProperty({ description: 'Client/customer company name' })
  @IsString()
  @IsNotEmpty()
  company_name!: string;

  @ApiPropertyOptional({ description: 'Customer type (free-form classification)' })
  @IsOptional()
  @IsString()
  customer_type?: string;

  @ApiPropertyOptional({
    description: 'Won opportunity this customer was created from',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  opportunity_id?: string;
}

const CONTRACT_TYPES = ['MAIN_CONTRACT', 'SUBCONTRACT', 'SUPPLY_AGREEMENT'] as const;

export class CreateContractDto {
  @ApiProperty({ description: 'Project this contract belongs to', format: 'uuid' })
  @IsUUID()
  project_id!: string;

  @ApiProperty({ description: 'Contract type', enum: CONTRACT_TYPES })
  @IsIn(CONTRACT_TYPES)
  contract_type!: (typeof CONTRACT_TYPES)[number];

  @ApiPropertyOptional({ description: 'Total contract value (DECIMAL string)' })
  @IsOptional()
  @IsDecimalString()
  contract_value?: string;

  @ApiPropertyOptional({ description: 'Customer (main_contract)', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  customer_id?: string;

  @ApiPropertyOptional({ description: 'Vendor (subcontract / supply_agreement)', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  vendor_id?: string;
}

export class CreateBillingDto {
  @ApiProperty({ description: 'Project this billing belongs to', format: 'uuid' })
  @IsUUID()
  project_id!: string;

  @ApiProperty({ description: 'Contract this billing is raised against', format: 'uuid' })
  @IsUUID()
  contract_id!: string;

  @ApiProperty({ description: 'Human-readable billing number', example: 'AR-2026-001' })
  @IsString()
  @IsNotEmpty()
  billing_number!: string;

  @ApiProperty({ description: 'Billing amount (DECIMAL string)' })
  @IsDecimalString()
  amount!: string;

  @ApiProperty({ description: 'Payment due date', example: '2026-07-15' })
  @IsDateString()
  due_date!: string;
}

const APPROVAL_TIERS = ['PM', 'EXECUTIVE', 'TENANT_ADMIN'] as const;

export class ApproveBillingDto {
  @ApiProperty({ description: 'Approver tier', enum: APPROVAL_TIERS })
  @IsIn(APPROVAL_TIERS)
  tier!: (typeof APPROVAL_TIERS)[number];
}

export class RecordArReceiptDto {
  @ApiProperty({ description: 'Project this receipt belongs to', format: 'uuid' })
  @IsUUID()
  project_id!: string;

  @ApiProperty({ description: 'Billing this receipt settles', format: 'uuid' })
  @IsUUID()
  billing_id!: string;

  @ApiProperty({ description: 'Customer who paid', format: 'uuid' })
  @IsUUID()
  customer_id!: string;

  @ApiProperty({ description: 'Amount received (DECIMAL string)' })
  @IsDecimalString()
  amount_received!: string;

  @ApiProperty({ description: 'Date payment was received', example: '2026-07-14' })
  @IsDateString()
  received_date!: string;

  @ApiPropertyOptional({ description: 'Payment method (transfer, cheque, ...)' })
  @IsOptional()
  @IsString()
  payment_method?: string;

  @ApiPropertyOptional({ description: 'Bank reference or cheque number' })
  @IsOptional()
  @IsString()
  payment_reference?: string;
}
