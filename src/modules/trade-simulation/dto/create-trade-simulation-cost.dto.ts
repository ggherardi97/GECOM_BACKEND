import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TradeSimulationCostAllocationMethod, TradeSimulationCostType } from '@prisma/client';
import { IsBoolean, IsEnum, IsNumberString, IsOptional, IsString, Length } from 'class-validator';

export class CreateTradeSimulationCostDto {
  @ApiProperty({ enum: TradeSimulationCostType })
  @IsEnum(TradeSimulationCostType)
  cost_type!: TradeSimulationCostType;

  @ApiProperty({ example: '800.00' })
  @IsNumberString()
  amount!: string;

  @ApiProperty({ minLength: 3, maxLength: 3, example: 'USD' })
  @IsString()
  @Length(3, 3)
  currency!: string;

  @ApiPropertyOptional({ example: '5.30' })
  @IsOptional()
  @IsNumberString()
  exchange_rate?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_in_icms_base?: boolean;

  @ApiPropertyOptional({ enum: TradeSimulationCostAllocationMethod })
  @IsOptional()
  @IsEnum(TradeSimulationCostAllocationMethod)
  allocation_method?: TradeSimulationCostAllocationMethod;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 500)
  notes?: string;
}


