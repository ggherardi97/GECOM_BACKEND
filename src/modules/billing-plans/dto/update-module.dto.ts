import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsNumber, Min } from 'class-validator';
import { MODULE_AREA_KEYS } from '../module-areas';

export class UpdateModuleDto {
  @ApiPropertyOptional({ example: 'SERVICES' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  code?: string;

  @ApiPropertyOptional({ example: 'Servicos' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name_pt_br?: string;

  @ApiPropertyOptional({ example: 'Modulo para operacao de servicos.' })
  @IsOptional()
  @IsString()
  description_pt_br?: string | null;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiPropertyOptional({ example: 350 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  monthly_price?: number;

  @ApiPropertyOptional({ example: ['service', 'finance'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsIn(MODULE_AREA_KEYS as unknown as string[], { each: true })
  area_keys?: string[];
}
