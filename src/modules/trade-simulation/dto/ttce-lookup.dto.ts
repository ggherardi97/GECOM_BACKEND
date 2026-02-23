import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumberString, IsOptional, IsString, Length } from 'class-validator';

export class TtceLookupDto {
  @ApiProperty({ example: '84713012' })
  @IsString()
  @Length(1, 20)
  ncm!: string;

  @ApiProperty({ example: '12000.00' })
  @IsNumberString()
  customsValue!: string;

  @ApiProperty({ example: 'USD' })
  @IsString()
  @Length(3, 3)
  currency!: string;

  @ApiPropertyOptional({ example: 'CN' })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  originCountry?: string;

  @ApiPropertyOptional({ example: 'SP' })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  destinationState?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  includeRaw?: boolean;
}


