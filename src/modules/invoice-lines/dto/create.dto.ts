import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class CreateInvoiceLineDTO {
  @ApiProperty({ description: 'Invoice id (FK invoices).', example: '7c38b352-0b45-4c8d-8f02-3c6a2b1f6f2d' })
  @IsUUID('4')
  invoice_id: string;

  @ApiProperty({ description: 'Line number (unique per invoice).', example: 1 })
  @IsInt()
  @Min(1)
  line_number: number;

  @ApiPropertyOptional({ description: 'Product id (FK products).', example: 'e3594b9c-fea9-4e72-adc2-29bccb16cf35' })
  @IsOptional()
  @IsUUID('4')
  product_id?: string;

  @ApiPropertyOptional({ description: 'Description', example: 'Handling fee' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Unit', example: 'service' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiProperty({ description: 'Unit price as decimal string.', example: '1250.00' })
  @IsString()
  @IsNotEmpty()
  unit_price: string;

  @ApiProperty({ description: 'Quantity as decimal string.', example: '2' })
  @IsString()
  @IsNotEmpty()
  quantity: string;

  @ApiPropertyOptional({ description: 'Tax rate between 0 and 1.', example: '0.15' })
  @IsOptional()
  @IsString()
  tax_rate?: string;

  @ApiPropertyOptional({ description: 'Discount percent (0..100).', example: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  discount_percent?: number;
}