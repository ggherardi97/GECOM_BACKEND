import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsUUID } from 'class-validator';
import { ProcessStatus } from '../enums/process-status.enum';

export class UpdateProcessStatusDTO {
  @ApiProperty({
    description: 'New process status legacy (int). Optional when status_config_id is provided.',
    example: ProcessStatus.IN_PROGRESS,
    required: false,
  })
  @IsOptional()
  @IsInt()
  status?: number;

  @ApiProperty({
    description: 'New status config id (preferred dynamic status).',
    example: 'f7e88a44-3cce-4d7a-b08f-2096d96a9175',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  status_config_id?: string;
}
