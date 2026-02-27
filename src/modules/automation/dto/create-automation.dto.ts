import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { AUTOMATION_TRIGGER_TYPES } from '../automation.types';

export class CreateAutomationDto {
  @ApiProperty({ example: 'Atualizar lead novo' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({ example: 'Quando lead for criado, enviar webhook.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 'leads' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  entity_name!: string;

  @ApiProperty({ enum: AUTOMATION_TRIGGER_TYPES, example: 'ENTITY_EVENT' })
  @IsString()
  @IsIn(AUTOMATION_TRIGGER_TYPES)
  trigger_type!: (typeof AUTOMATION_TRIGGER_TYPES)[number];

  @ApiPropertyOptional({
    example: { entityName: 'leads', eventType: 'CREATE' },
  })
  @IsOptional()
  @IsObject()
  trigger_config?: Record<string, unknown>;

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

