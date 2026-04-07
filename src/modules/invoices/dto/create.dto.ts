import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class CreateInvoiceLineDTO {
  @ApiPropertyOptional({
    description: 'Product id (optional). If missing, you can still use description + unit + pricing.',
    example: 'e3594b9c-fea9-4e72-adc2-29bccb16cf35',
  })
  @IsOptional()
  @IsUUID('4')
  product_id?: string;

  @ApiPropertyOptional({
    description: 'Free text description for the line.',
    example: 'Freight / Service fee',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Unit name (box, pallet, service, etc).',
    example: 'pallet',
  })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiProperty({
    description: 'Unit price as string decimal (Prisma Decimal).',
    example: '1250.00',
  })
  @IsString()
  @IsNotEmpty()
  unit_price: string;

  @ApiProperty({
    description: 'Quantity as string decimal (supports 1.0000 etc).',
    example: '2',
  })
  @IsString()
  @IsNotEmpty()
  quantity: string;

  @ApiPropertyOptional({
    description: 'Tax rate between 0 and 1. Example: 0.15 = 15%',
    example: '0.15',
  })
  @IsOptional()
  @IsString()
  tax_rate?: string;

  // ✅ NEW: discount amount (decimal string)
  @ApiPropertyOptional({
    description: 'Discount amount for this line (decimal string). Example: "380.00"',
    example: '380.00',
  })
  @IsOptional()
  @IsString()
  discount_amount?: string;

  // (Optional) keep for backward compatibility while front migrates
  @ApiPropertyOptional({
    description: 'Discount percent for this line (0..100). (Deprecated if using discount_amount)',
    example: 10,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  discount_percent?: number;
}

export class CreateInvoiceDTO {
  @ApiProperty({
    description: 'Company id related to this invoice.',
    example: 'a1b2c3d4-5e6f-7g8h-9i0j-k1l2m3n4o5p6',
  })
  @IsUUID('4')
  company_id: string;

  @ApiProperty({
    description: 'Currency id (FK currencies).',
    example: 'b1c2d3e4-5f6g-7h8i-9j0k-l1m2n3o4p5q6',
  })
  @IsUUID('4')
  currency_id: string;

  @ApiPropertyOptional({
    description: 'Quote datetime (ISO string).',
    example: '2025-12-30T10:00:00Z',
  })
  @IsOptional()
  @IsString()
  quote_at?: string;

  @ApiPropertyOptional({
    description: 'Exchange rate as decimal string. Default: 1',
    example: '1.00000000',
  })
  @IsOptional()
  @IsString()
  exchange_rate?: string;

  @ApiPropertyOptional({
    description: 'Amount converted to BRL (decimal string). Used for dashboards and receivables when invoice currency is not BRL.',
    example: '28450.00',
  })
  @IsOptional()
  @IsString()
  received_amount_brl?: string;

  @ApiPropertyOptional({
    description: 'Invoice version.',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  version?: number;

  // ✅ NEW: due date
  @ApiPropertyOptional({
    description: 'Invoice due datetime (ISO string).',
    example: '2026-02-20T00:00:00.000Z',
  })
  @IsOptional()
  @IsString()
  due_at?: string;

  @ApiPropertyOptional({ description: 'Billing address line 1', example: 'Rua X, 500' })
  @IsOptional()
  @IsString()
  billing_address_line1?: string;

  @ApiPropertyOptional({ description: 'Billing address line 2', example: 'Ap 143' })
  @IsOptional()
  @IsString()
  billing_address_line2?: string;

  @ApiPropertyOptional({ description: 'Billing city', example: 'Santo André' })
  @IsOptional()
  @IsString()
  billing_address_city?: string;

  @ApiPropertyOptional({ description: 'Billing state', example: 'SP' })
  @IsOptional()
  @IsString()
  billing_address_state?: string;

  @ApiPropertyOptional({ description: 'Billing postal code', example: '09271-400' })
  @IsOptional()
  @IsString()
  billing_address_postal_code?: string;

  @ApiPropertyOptional({ description: 'Billing country', example: 'Brazil' })
  @IsOptional()
  @IsString()
  billing_address_country?: string;

  @ApiPropertyOptional({
    description: 'Invoice status legacy (int or code). Optional when status_config_id is provided.',
    example: 1,
  })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null ? value : String(value).trim()))
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description: 'Status config id (preferred dynamic status).',
    example: 'f7e88a44-3cce-4d7a-b08f-2096d96a9175',
  })
  @IsOptional()
  @IsUUID('4')
  status_config_id?: string;

  @ApiPropertyOptional({
    description: 'Header discount percent (0..100).',
    example: 5,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  discount_percent?: number;

  @ApiPropertyOptional({ description: 'Notes', example: 'Payable within 10 business days.' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Terms', example: 'Net 10' })
  @IsOptional()
  @IsString()
  terms?: string;

  @ApiPropertyOptional({
    description: 'Invoice lines (optional on create; can be added later by PATCH).',
    type: CreateInvoiceLineDTO,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceLineDTO)
  lines?: CreateInvoiceLineDTO[];
}
