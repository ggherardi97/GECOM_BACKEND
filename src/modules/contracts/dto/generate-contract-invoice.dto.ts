import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class GenerateContractInvoiceDto {
  @ApiPropertyOptional({ description: 'Data da proposta' })
  @IsOptional()
  @IsDateString()
  quote_at?: string;

  @ApiPropertyOptional({ description: 'Vencimento da invoice' })
  @IsOptional()
  @IsDateString()
  due_at?: string;

  @ApiPropertyOptional({ description: 'Periodo faturado - inicio' })
  @IsOptional()
  @IsDateString()
  period_start?: string;

  @ApiPropertyOptional({ description: 'Periodo faturado - fim' })
  @IsOptional()
  @IsDateString()
  period_end?: string;
}
