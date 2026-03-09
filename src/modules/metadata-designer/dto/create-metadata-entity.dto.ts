import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateMetadataEntityDto {
  @ApiProperty({ example: 'custom_orders' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'Pedidos Customizados' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  display_name!: string;

  @ApiPropertyOptional({ example: 'Entidade para pedidos especiais do cliente.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'custom_orders' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  physical_table_name?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_schema_editable?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_field_editable?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_form_editable?: boolean;
}

