import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateMetadataFieldDto {
  @ApiProperty({ example: 'Data de Embarque' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  display_name!: string;

  @ApiProperty({ example: 'shipment_date' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'DATE' })
  @IsString()
  @IsNotEmpty()
  data_type!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  is_required?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  is_unique?: boolean;

  @ApiPropertyOptional({ example: '0' })
  @IsOptional()
  @IsString()
  default_value?: string | null;

  @ApiPropertyOptional({ example: { maxLength: 120 } })
  @IsOptional()
  @IsObject()
  format_json?: Record<string, unknown> | null;

  @ApiPropertyOptional({ example: '935d53b4-ea4c-4fe0-95a6-84f95f5cf204' })
  @IsOptional()
  @IsString()
  lookup_entity_id?: string | null;

  @ApiPropertyOptional({ example: 'SET_NULL' })
  @IsOptional()
  @IsString()
  lookup_on_delete?: string | null;

  @ApiPropertyOptional({ example: 'shipment_date' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  column_name?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  is_system?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  draft_version?: number;
}

