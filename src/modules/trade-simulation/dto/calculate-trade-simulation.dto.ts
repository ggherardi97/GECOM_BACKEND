import { ApiPropertyOptional } from '@nestjs/swagger';
import { TradeSimulationCalculationMode } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class CalculateTradeSimulationDto {
  @ApiPropertyOptional({ enum: TradeSimulationCalculationMode })
  @IsOptional()
  @IsEnum(TradeSimulationCalculationMode)
  calculation_mode?: TradeSimulationCalculationMode;
}


