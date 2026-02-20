import { PartialType } from '@nestjs/mapped-types';
import { IncidentChannel, IncidentImpact, IncidentPriority, IncidentStatus, IncidentUrgency } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateIncidentDto {
  @IsString()
  @MaxLength(50)
  number: string;

  @IsString()
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(IncidentStatus)
  status?: IncidentStatus;

  @IsOptional()
  @IsEnum(IncidentPriority)
  priority?: IncidentPriority;

  @IsOptional()
  @IsEnum(IncidentChannel)
  channel?: IncidentChannel;

  @IsOptional()
  @IsEnum(IncidentImpact)
  impact?: IncidentImpact;

  @IsOptional()
  @IsEnum(IncidentUrgency)
  urgency?: IncidentUrgency;

  @IsUUID()
  company_id: string;

  @IsOptional()
  @IsString()
  contact_id?: string;

  @IsOptional()
  @IsUUID()
  asset_id?: string;

  @IsOptional()
  @IsUUID()
  subject_id?: string;

  @IsOptional()
  @IsUUID()
  queue_id?: string;

  @IsOptional()
  @IsUUID()
  owner_user_id?: string;

  @IsOptional()
  @IsUUID()
  opened_by_user_id?: string;

  @IsOptional()
  @IsDateString()
  due_at?: string;

  @IsOptional()
  @IsDateString()
  resolved_at?: string;

  @IsOptional()
  @IsDateString()
  closed_at?: string;

  @IsOptional()
  @IsUUID()
  sla_policy_id?: string;

  @IsOptional()
  @IsUUID()
  sla_instance_id?: string;
}

export class UpdateIncidentDto extends PartialType(CreateIncidentDto) {}
