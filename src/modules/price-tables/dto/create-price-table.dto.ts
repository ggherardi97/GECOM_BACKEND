import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePriceTableItemDto {
  @ApiProperty({ description: 'Produto da tabela' })
  @IsUUID('4')
  product_id: string;

  @ApiPropertyOptional({ description: 'Quantidade minima', example: '1' })
  @IsOptional()
  @IsString()
  min_quantity?: string;

  @ApiPropertyOptional({ description: 'Quantidade maxima', example: '10' })
  @IsOptional()
  @IsString()
  max_quantity?: string;

  @ApiPropertyOptional({ description: 'Preco unitario', example: '120.00' })
  @IsOptional()
  @IsString()
  unit_price?: string;

  @ApiPropertyOptional({ description: 'Desconto percentual', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  discount_percent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreatePriceTableDto {
  @ApiProperty({ description: 'Nome da tabela' })
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Moeda base' })
  @IsOptional()
  @IsUUID('4')
  currency_id?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  is_default?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  valid_from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  valid_to?: string;

  @ApiPropertyOptional({ type: [CreatePriceTableItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePriceTableItemDto)
  items?: CreatePriceTableItemDto[];
}
