import { ApiPropertyOptional } from '@nestjs/swagger';
import { status_config_entity } from '@prisma/client';
import { IsBooleanString, IsEnum, IsOptional } from 'class-validator';

export class ListStatusConfigQueryDto {
  @ApiPropertyOptional({ enum: status_config_entity })
  @IsOptional()
  @IsEnum(status_config_entity)
  entity?: status_config_entity;

  @ApiPropertyOptional({ example: 'true' })
  @IsOptional()
  @IsBooleanString()
  active?: string;
}

