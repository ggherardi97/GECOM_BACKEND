import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OpportunityStatus } from '@prisma/client';
import {
  IsArray,
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

export class CreateOpportunityLineDto {
  @ApiPropertyOptional({ description: 'Produto relacionado', example: '11111111-1111-1111-1111-111111111111' })
  @IsOptional()
  @IsUUID('4')
  product_id?: string;

  @ApiPropertyOptional({ description: 'Descricao da linha' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Unidade', example: 'UN' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional({ description: 'Preco unitario', example: '120.50' })
  @IsOptional()
  @IsString()
  unit_price?: string;

  @ApiPropertyOptional({ description: 'Quantidade', example: '2' })
  @IsOptional()
  @IsString()
  quantity?: string;

  @ApiPropertyOptional({ description: 'Tax rate (0..1)', example: '0.1' })
  @IsOptional()
  @IsString()
  tax_rate?: string;

  @ApiPropertyOptional({ description: 'Desconto percentual 0..100', example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  discount_percent?: number;
}

export class CreateOpportunityDto {
  @ApiProperty({ description: 'Nome da oportunidade', example: 'Upgrade modulo financeiro' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Descricao detalhada' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: OpportunityStatus, default: OpportunityStatus.OPEN })
  @IsOptional()
  @IsEnum(OpportunityStatus)
  status?: OpportunityStatus;

  @ApiPropertyOptional({ description: 'Empresa vinculada' })
  @IsOptional()
  @IsUUID('4')
  company_id?: string;

  @ApiPropertyOptional({ description: 'Lead vinculado' })
  @IsOptional()
  @IsUUID('4')
  lead_id?: string;

  @ApiPropertyOptional({ description: 'Owner da oportunidade' })
  @IsOptional()
  @IsUUID('4')
  owner_user_id?: string;

  @ApiPropertyOptional({ description: 'Moeda' })
  @IsOptional()
  @IsUUID('4')
  currency_id?: string;

  @ApiPropertyOptional({ description: 'Data esperada de fechamento' })
  @IsOptional()
  @IsDateString()
  expected_close_at?: string;

  @ApiPropertyOptional({ description: 'Probabilidade de fechamento 0..100', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  probability_percent?: number;

  @ApiPropertyOptional({ description: 'Desconto percentual de cabecalho 0..100', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  discount_percent?: number;

  @ApiPropertyOptional({ type: [CreateOpportunityLineDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOpportunityLineDto)
  lines?: CreateOpportunityLineDto[];
}
