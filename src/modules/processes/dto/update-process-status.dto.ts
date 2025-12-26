import { ApiProperty } from '@nestjs/swagger';
import { IsInt } from 'class-validator';
import { ProcessStatus } from '../enums/process-status.enum';

export class UpdateProcessStatusDTO {
  @ApiProperty({
    description: 'New process status',
    example: ProcessStatus.IN_PROGRESS,
  })
  @IsInt()
  status: number;
}
