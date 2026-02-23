import { ApiPropertyOptional } from '@nestjs/swagger';
import { TradeSimulationType, TradeSimulationStatus } from '@prisma/client';
import { IsEnum, IsNumberString, IsOptional, IsUUID } from 'class-validator';

export class ListTradeSimulationsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  company_id?: string;

  @ApiPropertyOptional({ enum: TradeSimulationType })
  @IsOptional()
  @IsEnum(TradeSimulationType)
  type?: TradeSimulationType;

  @ApiPropertyOptional({ enum: TradeSimulationStatus })
  @IsOptional()
  @IsEnum(TradeSimulationStatus)
  status?: TradeSimulationStatus;

  @ApiPropertyOptional({ example: '20' })
  @IsOptional()
  @IsNumberString()
  take?: string;

  @ApiPropertyOptional({ example: '0' })
  @IsOptional()
  @IsNumberString()
  skip?: string;
}


