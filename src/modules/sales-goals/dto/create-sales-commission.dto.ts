import { ApiPropertyOptional } from '@nestjs/swagger';
import { SalesCommissionSource, SalesCommissionStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateSalesCommissionDto {
  @ApiPropertyOptional({ description: 'Meta relacionada' })
  @IsOptional()
  @IsUUID('4')
  sales_goal_id?: string;

  @ApiPropertyOptional({ description: 'Dono da comissao' })
  @IsOptional()
  @IsUUID('4')
  owner_user_id?: string;

  @ApiPropertyOptional({ enum: SalesCommissionSource, default: SalesCommissionSource.MANUAL })
  @IsOptional()
  @IsEnum(SalesCommissionSource)
  source_type?: SalesCommissionSource;

  @ApiPropertyOptional({ description: 'ID da origem (invoice/opportunity/contract)' })
  @IsOptional()
  @IsString()
  source_id?: string;

  @ApiPropertyOptional({ description: 'Base de calculo' })
  @IsOptional()
  @IsString()
  base_amount?: string;

  @ApiPropertyOptional({ description: 'Percentual da comissao (0..1)' })
  @IsOptional()
  @IsString()
  percent?: string;

  @ApiPropertyOptional({ description: 'Valor da comissao' })
  @IsOptional()
  @IsString()
  amount?: string;

  @ApiPropertyOptional({ enum: SalesCommissionStatus, default: SalesCommissionStatus.PENDING })
  @IsOptional()
  @IsEnum(SalesCommissionStatus)
  status?: SalesCommissionStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  due_at?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  paid_at?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
