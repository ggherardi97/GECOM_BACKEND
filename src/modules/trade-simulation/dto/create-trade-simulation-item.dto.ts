import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumberString, IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class CreateTradeSimulationItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  product_id?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @Length(1, 255)
  description!: string;

  @ApiProperty({ example: '84713012' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 20)
  ncm!: string;

  @ApiProperty({ example: '10.0000' })
  @IsNumberString()
  quantity!: string;

  @ApiProperty({ example: '1200.25' })
  @IsNumberString()
  unit_price!: string;

  @ApiPropertyOptional({ example: '300.00' })
  @IsOptional()
  @IsNumberString()
  freight_allocated?: string;

  @ApiPropertyOptional({ example: '50.00' })
  @IsOptional()
  @IsNumberString()
  insurance_allocated?: string;

  @ApiPropertyOptional({ example: '12000.00' })
  @IsOptional()
  @IsNumberString()
  customs_value_allocated?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 500)
  notes?: string;
}


