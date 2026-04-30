import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, IsInt, IsOptional, IsDateString, IsUUID, IsNumber, Min } from 'class-validator';
import { ProcessStatus } from '../enums/process-status.enum';

export class CreateProcessDTO {
  @ApiProperty({
    description: 'Process number (optional). If omitted, the backend can auto-generate it.',
    example: 'PROC-2025-001',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => {
    // Normalize: undefined/null/empty-string => undefined
    if (value == null) return undefined;
    const trimmed = String(value).trim();
    return trimmed.length ? trimmed : undefined;
  })
  process_number?: string;

  @ApiPropertyOptional({
    description: 'Process status legacy (int). Optional when status_config_id is provided.',
    example: ProcessStatus.PENDING,
  })
  @IsOptional()
  @IsInt()
  status?: number;

  @ApiPropertyOptional({
    description: 'Status config id (preferred dynamic status).',
    example: 'f7e88a44-3cce-4d7a-b08f-2096d96a9175',
  })
  @IsOptional()
  @IsUUID()
  status_config_id?: string;

  @ApiProperty({
    description: 'Invoice number',
    example: 'INV-2025-001',
    required: false,
  })
  @IsOptional()
  @IsString()
  invoice?: string;

  @ApiProperty({
    description: 'Company ID',
    example: 'a1b2c3d4-5e6f-7g8h-9i0j-k1l2m3n4o5p6',
  })
  @IsUUID()
  company_id: string;

  @ApiProperty({
    description: 'Primary contact user ID',
    example: 'b1c2d3e4-5f6g-7h8i-9j0k-l1m2n3o4p5q6',
    required: false,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value == null) return undefined;
    const trimmed = String(value).trim();
    return trimmed.length ? trimmed : undefined;
  })
  @IsUUID('4')
  primary_contact_id?: string;

  @ApiProperty({
    description: 'Process type',
    example: 'b1c2d3e4-5f6g-7h8i-9j0k-l1m2n3o4p5q6',
  })
  @IsUUID()
  process_type_id: string;

  @ApiPropertyOptional({
    description: 'Total process value (decimal)',
    example: 15000.5,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  total_value?: number;

  @ApiProperty({
    description: 'Shipment date (ISO 8601 string)',
    example: '2025-12-30T10:00:00Z',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  ship_date?: string;

  @ApiProperty({
    description: 'Completion percentage (0-100)',
    example: 0,
    default: 0,
    required: false,
  })
  @IsOptional()
  @IsInt()
  completed?: number;
}
