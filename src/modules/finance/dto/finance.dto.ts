import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PartialType } from '@nestjs/mapped-types';
import {
  FinancialAccountType,
  FinancialCategoryKind,
  FinancialEntryStatus,
  FinancialMovementType,
  FinancialPaymentMethod,
} from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class CreateFinancialCostCenterDto {
  @ApiProperty()
  @IsString()
  code: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateFinancialCostCenterDto extends PartialType(CreateFinancialCostCenterDto) {}

export class CreateFinancialCategoryDto {
  @ApiProperty()
  @IsString()
  code: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional({ enum: FinancialCategoryKind, default: FinancialCategoryKind.EXPENSE })
  @IsOptional()
  @IsEnum(FinancialCategoryKind)
  kind?: FinancialCategoryKind;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  parent_category_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  cost_center_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateFinancialCategoryDto extends PartialType(CreateFinancialCategoryDto) {}

export class CreateFinancialBankAccountDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsUUID('4')
  currency_id: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bank_name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  agency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  account_number?: string;

  @ApiPropertyOptional({ enum: FinancialAccountType, default: FinancialAccountType.CHECKING })
  @IsOptional()
  @IsEnum(FinancialAccountType)
  account_type?: FinancialAccountType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  opening_balance?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  allow_negative?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  reconciliation_date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateFinancialBankAccountDto extends PartialType(CreateFinancialBankAccountDto) {}

export class ReconcileFinancialBankAccountDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  reconciliation_date?: string;
}

export class CreateFinancialBankMovementDto {
  @ApiProperty()
  @IsUUID('4')
  bank_account_id: string;

  @ApiProperty({ enum: FinancialMovementType })
  @IsEnum(FinancialMovementType)
  movement_type: FinancialMovementType;

  @ApiProperty()
  @IsString()
  amount: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  movement_date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  category_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  cost_center_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reference_table?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  reference_id?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  reconciled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reconciliation_note?: string;
}

export class UpdateFinancialBankMovementDto extends PartialType(CreateFinancialBankMovementDto) {}

export class ReconcileFinancialBankMovementDto {
  @ApiProperty()
  @IsBoolean()
  reconciled: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reconciliation_note?: string;
}

export class CreateFinancialReceivableDto {
  @ApiProperty()
  @IsString()
  title_number: string;

  @ApiProperty()
  @IsUUID('4')
  company_id: string;

  @ApiProperty()
  @IsUUID('4')
  currency_id: string;

  @ApiProperty()
  @IsDateString()
  due_date: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  invoice_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  document_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  category_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  cost_center_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  issue_date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  original_amount?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  installment_number?: number;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  installment_total?: number;

  @ApiPropertyOptional({ enum: FinancialEntryStatus })
  @IsOptional()
  @IsEnum(FinancialEntryStatus)
  status?: FinancialEntryStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateFinancialReceivableDto extends PartialType(CreateFinancialReceivableDto) {}

export class CreateFinancialReceivablePaymentDto {
  @ApiProperty()
  @IsString()
  amount: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  payment_date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  bank_account_id?: string;

  @ApiPropertyOptional({ enum: FinancialPaymentMethod, default: FinancialPaymentMethod.OTHER })
  @IsOptional()
  @IsEnum(FinancialPaymentMethod)
  payment_method?: FinancialPaymentMethod;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fee_amount?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  interest_amount?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  discount_amount?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateFinancialReceivablePaymentDto extends PartialType(CreateFinancialReceivablePaymentDto) {}

export class GenerateReceivableFromInvoiceDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  installment_total?: number;

  @ApiPropertyOptional({ default: 30 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  interval_days?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  first_due_date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  category_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  cost_center_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateFinancialPayableDto {
  @ApiProperty()
  @IsString()
  payable_number: string;

  @ApiProperty()
  @IsUUID('4')
  currency_id: string;

  @ApiProperty()
  @IsDateString()
  due_date: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  company_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  document_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  category_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  cost_center_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  issue_date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  original_amount?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  installment_number?: number;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  installment_total?: number;

  @ApiPropertyOptional({ enum: FinancialEntryStatus })
  @IsOptional()
  @IsEnum(FinancialEntryStatus)
  status?: FinancialEntryStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateFinancialPayableDto extends PartialType(CreateFinancialPayableDto) {}

export class CreateFinancialPayablePaymentDto {
  @ApiProperty()
  @IsString()
  amount: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  payment_date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  bank_account_id?: string;

  @ApiPropertyOptional({ enum: FinancialPaymentMethod, default: FinancialPaymentMethod.OTHER })
  @IsOptional()
  @IsEnum(FinancialPaymentMethod)
  payment_method?: FinancialPaymentMethod;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fee_amount?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  interest_amount?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  discount_amount?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateFinancialPayablePaymentDto extends PartialType(CreateFinancialPayablePaymentDto) {}

