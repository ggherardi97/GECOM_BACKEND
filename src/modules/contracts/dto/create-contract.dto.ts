import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContractBillingFrequency, ContractStatus } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateContractLineDto {
  @ApiPropertyOptional({ description: 'Produto relacionado' })
  @IsOptional()
  @IsUUID('4')
  product_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'UN' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional({ example: '100.00' })
  @IsOptional()
  @IsString()
  unit_price?: string;

  @ApiPropertyOptional({ example: '1' })
  @IsOptional()
  @IsString()
  quantity?: string;

  @ApiPropertyOptional({ example: '0.1' })
  @IsOptional()
  @IsString()
  tax_rate?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  discount_percent?: number;

  @ApiPropertyOptional({ enum: ContractBillingFrequency, default: ContractBillingFrequency.MONTHLY })
  @IsOptional()
  @IsEnum(ContractBillingFrequency)
  billing_frequency?: ContractBillingFrequency;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_recurring?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  start_at?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  end_at?: string;
}

export class CreateContractDto {
  @ApiPropertyOptional({ description: 'Numero do contrato (auto se vazio)' })
  @IsOptional()
  @IsString()
  contract_number?: string;

  @ApiProperty({ description: 'Nome do contrato' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Empresa vinculada' })
  @IsUUID('4')
  company_id: string;

  @ApiPropertyOptional({ description: 'Lead vinculado' })
  @IsOptional()
  @IsUUID('4')
  lead_id?: string;

  @ApiPropertyOptional({ description: 'Oportunidade vinculada' })
  @IsOptional()
  @IsUUID('4')
  opportunity_id?: string;

  @ApiPropertyOptional({ description: 'Owner do contrato' })
  @IsOptional()
  @IsUUID('4')
  owner_user_id?: string;

  @ApiProperty({ description: 'Moeda do contrato' })
  @IsUUID('4')
  currency_id: string;

  @ApiPropertyOptional({ description: 'Tabela de preco aplicada' })
  @IsOptional()
  @IsUUID('4')
  price_table_id?: string;

  @ApiPropertyOptional({ enum: ContractStatus, default: ContractStatus.DRAFT })
  @IsOptional()
  @IsEnum(ContractStatus)
  status?: ContractStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  start_at?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  end_at?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  renewal_date?: string;

  @ApiPropertyOptional({ description: 'Dia de faturamento mensal', minimum: 1, maximum: 31 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  billing_day?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  auto_renew?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  discount_percent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  terms?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ type: [CreateContractLineDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateContractLineDto)
  lines?: CreateContractLineDto[];
}
