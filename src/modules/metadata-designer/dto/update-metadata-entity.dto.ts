import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateMetadataEntityDto {
  @ApiPropertyOptional({ example: 'Empresas' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  display_name?: string;

  @ApiPropertyOptional({ example: 'Descrição atualizada da entidade.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_schema_editable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_field_editable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_form_editable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiPropertyOptional({ example: '7fef0e8b-0108-4d16-a1d3-71f30043a03d' })
  @IsOptional()
  @IsString()
  primary_name_field_id?: string | null;
}

