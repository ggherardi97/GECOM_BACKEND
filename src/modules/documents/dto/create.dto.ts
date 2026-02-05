import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateDocumentDTO {
  @ApiProperty({ description: 'Company id (tenant)', example: 'c0a8012e-7e6f-4e50-ae46-44f9a5d8db88' })
  @IsUUID()
  company_id: string;

  @ApiPropertyOptional({ description: 'Parent folder document id (null for root)', example: 'b8f9b6a4-3e5d-4c9e-9b6a-1d9e7a3f2c11' })
  @IsOptional()
  @IsUUID()
  path?: string;

  @ApiProperty({ description: 'Display name (and also filename for files)', example: 'Contrato.pdf' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  file_name: string;

  @ApiPropertyOptional({ description: 'Description', example: 'Documento do processo' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ description: 'Object type (legacy int)', example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  object_type?: number;

  @ApiPropertyOptional({ description: 'Related process id', example: '3d0c2b8f-2b3b-49ee-8f75-5f8df8dfe111' })
  @IsOptional()
  @IsUUID()
  process_id?: string;

  @ApiPropertyOptional({ description: 'File bytes (optional - not recommended for big files)', example: null })
  @IsOptional()
  object_file?: any;

  @ApiPropertyOptional({ description: 'External link (R2 key, URL etc.)', example: 'r2://bucket/key' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  object_link?: string;

  @ApiPropertyOptional({ description: 'True if this record represents a link', example: false })
  @IsOptional()
  @IsBoolean()
  is_link?: boolean;

  @ApiPropertyOptional({ description: 'True if this record is a folder', example: true })
  @IsOptional()
  @IsBoolean()
  is_folder?: boolean;

  @ApiPropertyOptional({ description: 'Created by user id', example: 'f41de48b-f66c-4dfa-a295-7cf4996b802d' })
  @IsOptional()
  @IsUUID()
  created_by?: string;
}
