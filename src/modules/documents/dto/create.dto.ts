import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  IsInt,
  IsNumber,
  Min,
} from 'class-validator';

export class CreateDocumentDTO {
  // Tenant / ownership
  @ApiProperty({ description: 'Account/Company id (tenant)', example: 'c0a8012e-7e6f-4e50-ae46-44f9a5d8db88' })
  @IsUUID()
  account_id: string;

  @ApiPropertyOptional({ description: 'Created by user id', example: 'f41de48b-f66c-4dfa-a295-7cf4996b802d' })
  @IsOptional()
  @IsUUID()
  created_by_user_id?: string;

  // Hierarchy
  @ApiPropertyOptional({ description: 'Parent folder document id (null for root)', example: null })
  @IsOptional()
  @IsUUID()
  parent_id?: string | null;

  // Metadata
  @ApiProperty({ description: 'Drive item type', example: 'FILE' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  item_type: 'FILE' | 'FOLDER' | 'LINK';

  @ApiProperty({ description: 'Display name', example: 'Contrato.pdf' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  // Optional file metadata (filled by presign endpoint or during create)
  @ApiPropertyOptional({ description: 'Original file name (for files)', example: 'Contrato.pdf' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  filename?: string;

  @ApiPropertyOptional({ description: 'File extension', example: 'pdf' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  ext?: string;

  @ApiPropertyOptional({ description: 'Mime type', example: 'application/pdf' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  mime_type?: string;

  @ApiPropertyOptional({ description: 'File size in bytes', example: 12345 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  size_bytes?: number;

  @ApiPropertyOptional({ description: 'Description', example: 'Documento do processo' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ description: 'External key (link / r2 key / etc)', example: 'accounts/<id>/documents/<docId>/Contrato.pdf' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  external_key?: string;

  @ApiPropertyOptional({ description: 'Read only flag', example: false })
  @IsOptional()
  @IsBoolean()
  readonly?: boolean;

  // Optional polymorphic relation
  @ApiPropertyOptional({ description: 'Related table name', example: 'processes' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  related_table?: string;

  @ApiPropertyOptional({ description: 'Related table name', example: 'processes' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  related_name?: string;


  @ApiPropertyOptional({ description: 'Related entity id', example: '3d0c2b8f-2b3b-49ee-8f75-5f8df8dfe111' })
  @IsOptional()
  @IsUUID()
  related_id?: string;

  // Optional storage fields (can be set by presign endpoint)
  @ApiPropertyOptional({ description: 'Storage provider', example: 'CLOUDFLARE_R2' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  storage_provider?: string;

  @ApiPropertyOptional({ description: 'Bucket', example: 'gecom-documents' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  bucket?: string;

  @ApiPropertyOptional({ description: 'Object key in bucket', example: 'accounts/<id>/documents/<docId>/Contrato.pdf' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  object_key?: string;

  @ApiPropertyOptional({ description: 'ETag', example: '"8f5a..."' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  etag?: string;

  @ApiPropertyOptional({ description: 'Upload status', example: 'PENDING' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  upload_status?: string;

  @ApiPropertyOptional({ description: 'Version', example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;
}
