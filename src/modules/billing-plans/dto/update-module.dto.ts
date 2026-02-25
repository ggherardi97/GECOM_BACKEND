import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsNumber, Min } from 'class-validator';

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
}
