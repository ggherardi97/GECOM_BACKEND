import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TradeSimulationCalculationMode, TradeSimulationStatus, TradeSimulationType } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsNumberString, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';

export class CreateTradeSimulationDto {
  @ApiProperty()
  @IsUUID()
  company_id!: string;

  @ApiProperty({ enum: TradeSimulationType })
  @IsEnum(TradeSimulationType)
  type!: TradeSimulationType;

  @ApiProperty({ minLength: 3, maxLength: 3, example: 'USD' })
  @IsString()
  @Length(3, 3)
  currency!: string;

  @ApiProperty({ example: '120000.50' })
  @IsNumberString()
  customs_value!: string;

  @ApiPropertyOptional({ enum: TradeSimulationCalculationMode })
  @IsOptional()
  @IsEnum(TradeSimulationCalculationMode)
  calculation_mode?: TradeSimulationCalculationMode;

  @ApiPropertyOptional({ enum: TradeSimulationStatus })
  @IsOptional()
  @IsEnum(TradeSimulationStatus)
  status?: TradeSimulationStatus;

  @ApiPropertyOptional({ example: '5.3210' })
  @IsOptional()
  @IsNumberString()
  exchange_rate?: string;

  @ApiPropertyOptional({ example: 'FOB' })
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

  @ApiPropertyOptional({ example: '2000.00' })
  @IsOptional()
  @IsNumberString()
  freight_international?: string;

  @ApiPropertyOptional({ example: '500.00' })
  @IsOptional()
  @IsNumberString()
  insurance_international?: string;

  @ApiPropertyOptional({ example: '300.00' })
  @IsOptional()
  @IsNumberString()
  other_additions?: string;

  @ApiPropertyOptional({ example: '0.180000' })
  @IsOptional()
  @IsNumberString()
  icms_rate?: string;
}


