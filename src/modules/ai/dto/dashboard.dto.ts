import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

export class AiDashboardDto {
  @ApiProperty({ example: 'Crie um dashboard financeiro com KPIs e tendencia mensal de faturamento' })
  @IsString()
  @MaxLength(1200)
  naturalLanguage!: string;

  @ApiPropertyOptional({ type: [String], example: ['invoices', 'companies'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  entityHints?: string[];
}

