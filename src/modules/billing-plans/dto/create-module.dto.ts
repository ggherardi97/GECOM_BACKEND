import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsNumber, Min } from 'class-validator';

export class CreateModuleDto {
  @ApiProperty({ example: 'SERVICES' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  code!: string;

  @ApiProperty({ example: 'Servicos' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name_pt_br!: string;

  @ApiPropertyOptional({ example: 'Modulo para operacao de servicos.' })
  @IsOptional()
  @IsString()
  description_pt_br?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiPropertyOptional({ example: 350, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  monthly_price?: number;
}
