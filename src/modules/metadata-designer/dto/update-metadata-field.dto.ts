import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateMetadataFieldDto {
  @ApiPropertyOptional({ example: 'Previsão de Embarque' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  display_name?: string;

  @ApiPropertyOptional({ example: 'STRING' })
  @IsOptional()
  @IsString()
  data_type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_required?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_unique?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  default_value?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  format_json?: Record<string, unknown> | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lookup_entity_id?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lookup_on_delete?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

