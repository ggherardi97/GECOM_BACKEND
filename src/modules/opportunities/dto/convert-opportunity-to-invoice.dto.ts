import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsOptional, IsUUID } from 'class-validator';

export class ConvertOpportunityToInvoiceDto {
  @ApiPropertyOptional({ description: 'Data da proposta' })
  @IsOptional()
  @IsDateString()
  quote_at?: string;

  @ApiPropertyOptional({ description: 'Data de vencimento' })
  @IsOptional()
  @IsDateString()
  due_at?: string;

  @ApiPropertyOptional({ description: 'Empresa para faturar (override da oportunidade)' })
  @IsOptional()
  @IsUUID('4')
  company_id?: string;

  @ApiPropertyOptional({ description: 'Moeda da invoice (override da oportunidade)' })
  @IsOptional()
  @IsUUID('4')
  currency_id?: string;

  @ApiPropertyOptional({ description: 'Forca nova conversao mesmo se ja convertida', default: false })
  @IsOptional()
  @IsBoolean()
  force_new?: boolean;
}
