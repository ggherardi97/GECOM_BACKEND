import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export enum LeadActivityTypeDto {
  NOTE = 'NOTE',
  CALL = 'CALL',
  EMAIL = 'EMAIL',
  MEETING = 'MEETING',
  WHATSAPP = 'WHATSAPP',
  TASK = 'TASK',
}

export class CreateLeadActivityDto {
  @IsEnum(LeadActivityTypeDto)
  type!: LeadActivityTypeDto;

  @IsString()
  @MaxLength(255)
  subject!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  due_date?: string;

  @IsOptional()
  @IsDateString()
  completed_at?: string;

  @IsOptional()
  @IsUUID('4')
  assigned_to_user_id?: string;
}
