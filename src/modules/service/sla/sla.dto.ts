import { PartialType } from '@nestjs/mapped-types';
import { IncidentStatus, SlaEventType, SlaInstanceKpiStatus, SlaInstanceStatus, SlaKpiType } from '@prisma/client';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsObject, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateSlaPolicyDto {
  @IsString()
  @MaxLength(150)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsUUID()
  business_calendar_id?: string;

  @IsOptional()
  @IsObject()
  apply_when_json?: Record<string, unknown>;
}

export class UpdateSlaPolicyDto extends PartialType(CreateSlaPolicyDto) {}

export class CreateSlaKpiDto {
  @IsUUID()
  sla_policy_id: string;

  @IsString()
  @MaxLength(150)
  name: string;

  @IsEnum(SlaKpiType)
  kpi_type: SlaKpiType;

  @IsString()
  @MaxLength(100)
  start_condition: string;

  @IsOptional()
  @IsEnum(IncidentStatus)
  start_status?: IncidentStatus;

  @IsString()
  @MaxLength(100)
  stop_condition: string;

  @IsOptional()
  @IsEnum(IncidentStatus)
  stop_status?: IncidentStatus;

  @IsOptional()
  @IsObject()
  pause_when_status_in?: Record<string, unknown>;

  @IsInt()
  @Min(0)
  warning_after_minutes: number;

  @IsInt()
  @Min(1)
  fail_after_minutes: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sort_order?: number;
}

export class UpdateSlaKpiDto extends PartialType(CreateSlaKpiDto) {}

export class CreateSlaInstanceDto {
  @IsUUID()
  incident_id: string;

  @IsUUID()
  sla_policy_id: string;

  @IsOptional()
  @IsEnum(SlaInstanceStatus)
  status?: SlaInstanceStatus;

  @IsOptional()
  @IsDateString()
  started_at?: string;

  @IsOptional()
  @IsDateString()
  paused_at?: string;

  @IsOptional()
  @IsDateString()
  completed_at?: string;
}

export class UpdateSlaInstanceDto extends PartialType(CreateSlaInstanceDto) {}

export class CreateSlaInstanceKpiDto {
  @IsUUID()
  sla_instance_id: string;

  @IsUUID()
  sla_kpi_id: string;

  @IsOptional()
  @IsEnum(SlaInstanceKpiStatus)
  status?: SlaInstanceKpiStatus;

  @IsDateString()
  target_at: string;

  @IsOptional()
  @IsDateString()
  warning_at?: string;

  @IsOptional()
  @IsDateString()
  met_at?: string;

  @IsOptional()
  @IsDateString()
  breached_at?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  elapsed_minutes?: number;

  @IsOptional()
  @IsDateString()
  last_tick_at?: string;
}

export class UpdateSlaInstanceKpiDto extends PartialType(CreateSlaInstanceKpiDto) {}

export class CreateSlaEventDto {
  @IsUUID()
  incident_id: string;

  @IsOptional()
  @IsUUID()
  sla_instance_kpi_id?: string;

  @IsEnum(SlaEventType)
  event_type: SlaEventType;

  @IsOptional()
  @IsDateString()
  occurred_at?: string;

  @IsOptional()
  @IsObject()
  metadata_json?: Record<string, unknown>;
}

export class UpdateSlaEventDto extends PartialType(CreateSlaEventDto) {}
