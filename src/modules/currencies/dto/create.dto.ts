import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class CreateCurrencyDTO {
  @ApiProperty({ description: 'ISO currency code (unique).', example: 'BRL' })
  @IsString()
  @IsNotEmpty()
  @Length(3, 3)
  code: string;

  @ApiProperty({ description: 'Currency name.', example: 'Brazilian Real' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ description: 'Currency symbol.', example: 'R$' })
  @IsOptional()
  @IsString()
  symbol?: string;

  @ApiPropertyOptional({ description: 'Decimal places.', example: 2 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  decimals?: number;

  @ApiPropertyOptional({ description: 'Is active?', example: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
