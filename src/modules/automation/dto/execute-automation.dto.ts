import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';

export class ExecuteAutomationDto {
  @ApiPropertyOptional({ example: '2a0958d5-093a-4d2c-9e2e-64ce82ff7b9c' })
  @IsOptional()
  @IsString()
  record_id?: string;

  @ApiPropertyOptional({ example: { source: 'botao-executar' } })
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

