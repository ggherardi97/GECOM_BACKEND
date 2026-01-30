import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsInt, IsOptional, IsDateString, IsUUID } from 'class-validator';
import { ProcessStatus } from '../enums/process-status.enum';

export class CreateProcessDTO {
  @ApiProperty({
    description: 'Process number',
    example: 'PROC-2025-001',
  })
  @IsString()
  process_number: string;

  @ApiProperty({
    description: 'Process status',
    example: ProcessStatus.PENDING,
  })
  @IsInt()
  status: number;

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
  })
  @IsUUID()
  primary_contact_id: string;

  @ApiProperty({
    description: 'Process type',
    example: 'b1c2d3e4-5f6g-7h8i-9j0k-l1m2n3o4p5q6',
  })
  @IsUUID()
  process_type_id: string;

  @ApiProperty({
    description: 'Shipment date',
    example: '2025-12-30T10:00:00Z',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  ship_date?: Date;

  @ApiProperty({
    description: 'Completion percentage (0-100)',
    example: 0,
    default: 0,
  })
  @IsOptional()
  @IsInt()
  completed?: number;
}
