import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsInt, IsOptional, IsBoolean, IsDateString, IsUUID } from 'class-validator';
import { EventType } from '../enums/event-type.enum';
import { EventStatus } from '../enums/event-status.enum';

export class CreateEventDTO {
  @ApiProperty({
    description: 'Table name this event is related to',
    example: 'processes',
  })
  @IsString()
  related_table: string;

  @ApiProperty({
    description: 'ID of the related record',
    example: 'a1b2c3d4-5e6f-7g8h-9i0j-k1l2m3n4o5p6',
  })
  @IsUUID()
  related_id: string;

  @ApiProperty({
    description: 'Event status',
    example: EventStatus.PENDING,
    required: false,
  })
  @IsOptional()
  @IsInt()
  status?: number;

  @ApiProperty({
    description: 'Event title',
    example: 'Process status changed to In Progress',
  })
  @IsString()
  title: string;

  @ApiProperty({
    description: 'Event description',
    example: 'The process was moved to In Progress by John Doe',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Event type',
    example: EventType.STATUS_CHANGE,
  })
  @IsInt()
  type: number;

  @ApiProperty({
    description: 'Event start time',
    example: '2025-12-26T10:00:00Z',
  })
  @IsDateString()
  start_time: Date;

  @ApiProperty({
    description: 'Event end time',
    example: '2025-12-26T11:00:00Z',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  end_time?: Date;

  @ApiProperty({
    description: 'Is the event finished',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  finished?: boolean;

  @ApiProperty({
    description: 'Is this event related to a document',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  document_related?: boolean;
}
