import { PartialType } from '@nestjs/mapped-types';
import { QueueAssignmentMode, QueueMemberRole } from '@prisma/client';
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateQueueDto {
  @IsString()
  @MaxLength(150)
  name: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsEnum(QueueAssignmentMode)
  assignment_mode?: QueueAssignmentMode;

  @IsOptional()
  @IsUUID()
  default_sla_policy_id?: string;
}

export class UpdateQueueDto extends PartialType(CreateQueueDto) {}

export class CreateQueueMemberDto {
  @IsUUID()
  queue_id: string;

  @IsUUID()
  user_id: string;

  @IsOptional()
  @IsEnum(QueueMemberRole)
  role?: QueueMemberRole;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateQueueMemberDto extends PartialType(CreateQueueMemberDto) {}
