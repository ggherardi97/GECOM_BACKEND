import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GoalPeriodType } from '@prisma/client';
import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateSalesGoalDto {
  @ApiProperty({ description: 'Usuario da meta' })
  @IsUUID('4')
  owner_user_id: string;

  @ApiProperty({ enum: GoalPeriodType })
  @IsEnum(GoalPeriodType)
  period_type: GoalPeriodType;

  @ApiProperty({ description: 'Inicio do periodo' })
  @IsDateString()
  period_start: string;

  @ApiProperty({ description: 'Fim do periodo' })
  @IsDateString()
  period_end: string;

  @ApiPropertyOptional({ description: 'Valor alvo' })
  @IsOptional()
  @IsString()
  target_amount?: string;

  @ApiPropertyOptional({ description: 'Valor atingido' })
  @IsOptional()
  @IsString()
  achieved_amount?: string;

  @ApiPropertyOptional({ description: 'Percentual de comissao (0..1)' })
  @IsOptional()
  @IsString()
  commission_percent?: string;

  @ApiPropertyOptional({ description: 'Moeda' })
  @IsOptional()
  @IsUUID('4')
  currency_id?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
