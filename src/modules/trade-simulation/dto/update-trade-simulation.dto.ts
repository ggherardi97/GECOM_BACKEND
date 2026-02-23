import { ApiPropertyOptional } from '@nestjs/swagger';
import { TradeSimulationCalculationMode, TradeSimulationStatus } from '@prisma/client';
import { IsEnum, IsNumberString, IsOptional, IsString, Length } from 'class-validator';

export class UpdateTradeSimulationDto {
  @ApiPropertyOptional({ enum: TradeSimulationStatus })
  @IsOptional()
  @IsEnum(TradeSimulationStatus)
  status?: TradeSimulationStatus;

  @ApiPropertyOptional({ enum: TradeSimulationCalculationMode })
  @IsOptional()
  @IsEnum(TradeSimulationCalculationMode)
  calculation_mode?: TradeSimulationCalculationMode;

  @ApiPropertyOptional({ minLength: 3, maxLength: 3 })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumberString()
  exchange_rate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 20)
  incoterm?: string;

  @ApiPropertyOptional({ example: 'CN' })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  origin_country?: string;

  @ApiPropertyOptional({ example: 'SP' })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  destination_state?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumberString()
  customs_value?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumberString()
  freight_international?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumberString()
  insurance_international?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumberString()
  other_additions?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumberString()
  icms_rate?: string;
}


