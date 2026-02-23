import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { lead_status_enum, status_config_entity } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class CreateStatusConfigDto {
  @ApiProperty({ enum: status_config_entity })
  @IsEnum(status_config_entity)
  entity!: status_config_entity;

  @ApiProperty({ example: 'PENDING' })
  @IsString()
  @Length(1, 60)
  code!: string;

  @ApiProperty({ example: 'Pendente' })
  @IsString()
  @Length(1, 120)
  label!: string;

  @ApiPropertyOptional({ example: '#64748B' })
  @IsOptional()
  @IsString()
  @Length(1, 20)
  color?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  sort_order?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiPropertyOptional({ example: 0, description: 'Obrigatório para PROCESS e INVOICE.' })
  @IsOptional()
  @IsInt()
  legacy_int_value?: number;

  @ApiPropertyOptional({ enum: lead_status_enum, description: 'Opcional para LEAD (usado para compatibilidade legado).' })
  @IsOptional()
  @IsEnum(lead_status_enum)
  legacy_lead_status?: lead_status_enum;
}

