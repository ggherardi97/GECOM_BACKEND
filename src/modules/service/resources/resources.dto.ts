import { PartialType } from '@nestjs/mapped-types';
import { AppointmentStatus } from '@prisma/client';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsObject, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateResourceDto {
  @IsUUID()
  user_id: string;

  @IsString()
  @MaxLength(150)
  name: string;

  @IsOptional()
  @IsUUID()
  calendar_id?: string;

  @IsOptional()
  @IsObject()
  skills_json?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity_per_day?: number;

  @IsOptional()
  @IsBoolean()
  can_receive_cases?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  max_open_incidents?: number;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  board_color?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateResourceDto extends PartialType(CreateResourceDto) {}

export class CreateAppointmentDto {
  @IsUUID()
  resource_id: string;

  @IsOptional()
  @IsUUID()
  incident_id?: string;

  @IsString()
  @MaxLength(255)
  title: string;

  @IsDateString()
  start_at: string;

  @IsDateString()
  end_at: string;

  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateAppointmentDto extends PartialType(CreateAppointmentDto) {}
