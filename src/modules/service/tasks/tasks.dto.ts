import { PartialType } from '@nestjs/mapped-types';
import { IncidentPriority, TaskStatus, TaskTypeChannel } from '@prisma/client';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateTaskTypeDto {
  @IsString()
  @MaxLength(150)
  name: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  default_duration_minutes?: number;

  @IsOptional()
  @IsEnum(TaskTypeChannel)
  channel?: TaskTypeChannel;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateTaskTypeDto extends PartialType(CreateTaskTypeDto) {}

export class CreateTaskDto {
  @IsUUID()
  incident_id: string;

  @IsOptional()
  @IsUUID()
  task_type_id?: string;

  @IsString()
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(TaskTypeChannel)
  type: TaskTypeChannel;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsEnum(IncidentPriority)
  priority?: IncidentPriority;

  @IsOptional()
  @IsUUID()
  assigned_to_user_id?: string;

  @IsOptional()
  @IsDateString()
  due_at?: string;

  @IsOptional()
  @IsDateString()
  started_at?: string;

  @IsOptional()
  @IsDateString()
  completed_at?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  estimated_minutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  actual_minutes?: number;
}

export class UpdateTaskDto extends PartialType(CreateTaskDto) {}
