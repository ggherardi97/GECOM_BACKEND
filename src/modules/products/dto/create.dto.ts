import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateProductDTO {
  @ApiProperty({ description: 'Product internal code (unique).', example: 'PRD-0001' })
  @IsString()
  @IsNotEmpty()
  product_code: string;

  @ApiProperty({ description: 'Product name.', example: 'Container Handling' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ description: 'Brand', example: 'ACME' })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional({ description: 'Unit (box, pallet, service, etc)', example: 'service' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional({ description: 'Description', example: 'Handling fee for containers' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Currency id (FK currencies).', example: 'b1c2d3e4-5f6g-7h8i-9j0k-l1m2n3o4p5q6' })
  @IsUUID('4')
  currency_id: string;

  @ApiPropertyOptional({ description: 'Default unit price (decimal string).', example: '1250.00' })
  @IsOptional()
  @IsString()
  default_unit_price?: string;

  @ApiPropertyOptional({ description: 'Default tax rate (0..1). Example: 0.15 = 15%', example: '0.15' })
  @IsOptional()
  @IsString()
  default_tax_rate?: string;

  @ApiPropertyOptional({ description: 'Is active?', example: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}