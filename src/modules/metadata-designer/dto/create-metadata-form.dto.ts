import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateMetadataFormDto {
  @ApiProperty({ example: 'main' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'Formulário Principal' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  display_name!: string;

  @ApiProperty({ example: 'MAIN' })
  @IsString()
  @IsNotEmpty()
  form_type!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  is_default?: boolean;

  @ApiPropertyOptional({
    example: {
      tabs: [{ name: 'geral', sections: [{ name: 'dados_basicos', fields: ['name'] }] }],
    },
  })
  @IsOptional()
  @IsObject()
  definition_json?: Record<string, unknown>;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

