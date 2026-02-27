import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateAutomationDto {
  @ApiPropertyOptional({ example: 'Atualizar lead novo' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ example: 'Descrição da automação' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'leads' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  entity_name?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiPropertyOptional({
    example: {
      version: 1,
      trigger: { type: 'MANUAL', config: {} },
      actions: [],
      ui: { nodes: [{ id: 'trigger', x: 120, y: 80 }] },
    },
  })
  @IsOptional()
  @IsObject()
  workflow_json?: Record<string, unknown>;
}

