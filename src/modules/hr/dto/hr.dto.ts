import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PartialType } from '@nestjs/mapped-types';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

const EMPLOYEE_GENDERS = ['MALE', 'FEMALE', 'OTHER'] as const;
const LEAVE_REQUEST_STATUSES = ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELED'] as const;
const SKILL_LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'] as const;
const CERT_STATUSES = ['VALID', 'EXPIRED', 'REVOKED'] as const;
const LIFECYCLE_TYPES = ['ONBOARDING', 'OFFBOARDING'] as const;
const LIFECYCLE_RESPONSIBLE_ROLES = ['HR', 'MANAGER', 'IT', 'FINANCE', 'EMPLOYEE'] as const;
const LIFECYCLE_STATUSES = ['ACTIVE', 'COMPLETED', 'CANCELED'] as const;
const LIFECYCLE_TASK_STATUSES = ['OPEN', 'DOING', 'DONE', 'BLOCKED', 'CANCELED'] as const;

export class CreateHrDepartmentDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  parent_department_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  manager_employee_id?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateHrDepartmentDto extends PartialType(CreateHrDepartmentDto) {}

export class CreateHrPositionDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  level?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  is_leadership?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateHrPositionDto extends PartialType(CreateHrPositionDto) {}

export class CreateHrWorkLocationDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  address_json?: Record<string, unknown>;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateHrWorkLocationDto extends PartialType(CreateHrWorkLocationDto) {}

export class CreateHrEmploymentStatusDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiProperty()
  @IsString()
  @MaxLength(40)
  code: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  is_default?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sort_order?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateHrEmploymentStatusDto extends PartialType(CreateHrEmploymentStatusDto) {}

export class CreateHrDocumentTypeDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiProperty()
  @IsString()
  @MaxLength(40)
  code: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateHrDocumentTypeDto extends PartialType(CreateHrDocumentTypeDto) {}

export class CreateHrMaritalStatusDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiProperty()
  @IsString()
  @MaxLength(40)
  code: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateHrMaritalStatusDto extends PartialType(CreateHrMaritalStatusDto) {}

export class CreateHrEmployeeDto {
  @ApiProperty()
  @IsString()
  @MaxLength(160)
  full_name: string;

  @ApiProperty()
  @IsUUID('4')
  employment_status_id: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  employee_number?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  preferred_name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  email_work?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone_work?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone_mobile?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  birth_date?: string;

  @ApiPropertyOptional({ enum: EMPLOYEE_GENDERS })
  @IsOptional()
  @IsIn(EMPLOYEE_GENDERS)
  gender?: (typeof EMPLOYEE_GENDERS)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  marital_status_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  document_type_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  document_number?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  nationality?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  address_json?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  profile_picture_key?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  user_id?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateHrEmployeeDto extends PartialType(CreateHrEmployeeDto) {}

export class CreateHrDepartmentAssignmentDto {
  @ApiProperty()
  @IsUUID('4')
  employee_id: string;

  @ApiProperty()
  @IsUUID('4')
  department_id: string;

  @ApiProperty()
  @IsUUID('4')
  position_id: string;

  @ApiProperty()
  @IsDateString()
  start_date: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  end_date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  manager_employee_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  work_location_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  cost_center?: string;
}

export class UpdateHrDepartmentAssignmentDto extends PartialType(CreateHrDepartmentAssignmentDto) {}

export class CreateHrWorkScheduleDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiProperty()
  @IsObject()
  schedule_json: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  weekly_minutes?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  is_default?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateHrWorkScheduleDto extends PartialType(CreateHrWorkScheduleDto) {}

export class CreateHrEmployeeScheduleAssignmentDto {
  @ApiProperty()
  @IsUUID('4')
  employee_id: string;

  @ApiProperty()
  @IsUUID('4')
  work_schedule_id: string;

  @ApiProperty()
  @IsDateString()
  start_date: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  end_date?: string;
}

export class UpdateHrEmployeeScheduleAssignmentDto extends PartialType(CreateHrEmployeeScheduleAssignmentDto) {}

export class CreateHrLeaveTypeDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiProperty()
  @IsString()
  @MaxLength(40)
  code: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  requires_approval?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_paid?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  counts_as_vacation?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  max_days_per_year?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  allow_hourly?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sort_order?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateHrLeaveTypeDto extends PartialType(CreateHrLeaveTypeDto) {}

export class CreateHrLeaveRequestDto {
  @ApiProperty()
  @IsUUID('4')
  employee_id: string;

  @ApiProperty()
  @IsUUID('4')
  leave_type_id: string;

  @ApiProperty()
  @IsDateString()
  start_datetime: string;

  @ApiProperty()
  @IsDateString()
  end_datetime: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  attachment_key?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  approver_employee_id?: string;

  @ApiPropertyOptional({ enum: LEAVE_REQUEST_STATUSES })
  @IsOptional()
  @IsIn(LEAVE_REQUEST_STATUSES)
  status?: (typeof LEAVE_REQUEST_STATUSES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  decision_reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  decided_at?: string;
}

export class UpdateHrLeaveRequestDto extends PartialType(CreateHrLeaveRequestDto) {}

export class CreateHrSkillCategoryDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sort_order?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateHrSkillCategoryDto extends PartialType(CreateHrSkillCategoryDto) {}

export class CreateHrSkillDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  category_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateHrSkillDto extends PartialType(CreateHrSkillDto) {}

export class CreateHrEmployeeSkillDto {
  @ApiProperty()
  @IsUUID('4')
  employee_id: string;

  @ApiProperty()
  @IsUUID('4')
  skill_id: string;

  @ApiPropertyOptional({ enum: SKILL_LEVELS, default: 'BEGINNER' })
  @IsOptional()
  @IsIn(SKILL_LEVELS)
  proficiency_level?: (typeof SKILL_LEVELS)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  years_experience?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateHrEmployeeSkillDto extends PartialType(CreateHrEmployeeSkillDto) {}

export class CreateHrCertificationDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  issuer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  validity_months?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateHrCertificationDto extends PartialType(CreateHrCertificationDto) {}

export class CreateHrEmployeeCertificationDto {
  @ApiProperty()
  @IsUUID('4')
  employee_id: string;

  @ApiProperty()
  @IsUUID('4')
  certification_id: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  issued_at?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expires_at?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  certificate_number?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  attachment_key?: string;

  @ApiPropertyOptional({ enum: CERT_STATUSES })
  @IsOptional()
  @IsIn(CERT_STATUSES)
  status?: (typeof CERT_STATUSES)[number];
}

export class UpdateHrEmployeeCertificationDto extends PartialType(CreateHrEmployeeCertificationDto) {}

export class CreateHrLifecycleTemplateDto {
  @ApiProperty()
  @IsString()
  @MaxLength(160)
  name: string;

  @ApiProperty({ enum: LIFECYCLE_TYPES })
  @IsIn(LIFECYCLE_TYPES)
  type: (typeof LIFECYCLE_TYPES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateHrLifecycleTemplateDto extends PartialType(CreateHrLifecycleTemplateDto) {}

export class CreateHrLifecycleStageDto {
  @ApiProperty()
  @IsUUID('4')
  template_id: string;

  @ApiProperty()
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sort_order?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  wip_limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateHrLifecycleStageDto extends PartialType(CreateHrLifecycleStageDto) {}

export class CreateHrLifecycleTaskDto {
  @ApiProperty()
  @IsUUID('4')
  template_id: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  stage_id?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(160)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: LIFECYCLE_RESPONSIBLE_ROLES, default: 'HR' })
  @IsOptional()
  @IsIn(LIFECYCLE_RESPONSIBLE_ROLES)
  responsible_role?: (typeof LIFECYCLE_RESPONSIBLE_ROLES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  due_days_after_start?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  requires_attachment?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_mandatory?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sort_order?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateHrLifecycleTaskDto extends PartialType(CreateHrLifecycleTaskDto) {}

export class CreateHrEmployeeLifecycleDto {
  @ApiProperty()
  @IsUUID('4')
  employee_id: string;

  @ApiProperty()
  @IsUUID('4')
  template_id: string;

  @ApiProperty()
  @IsDateString()
  start_date: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  target_end_date?: string;

  @ApiPropertyOptional({ enum: LIFECYCLE_STATUSES, default: 'ACTIVE' })
  @IsOptional()
  @IsIn(LIFECYCLE_STATUSES)
  status?: (typeof LIFECYCLE_STATUSES)[number];
}

export class UpdateHrEmployeeLifecycleDto extends PartialType(CreateHrEmployeeLifecycleDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  current_stage_id?: string;
}

export class CreateHrEmployeeLifecycleTaskDto {
  @ApiProperty()
  @IsUUID('4')
  employee_lifecycle_id: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  template_task_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  stage_id?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(160)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  responsible_employee_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  due_date?: string;

  @ApiPropertyOptional({ enum: LIFECYCLE_TASK_STATUSES, default: 'OPEN' })
  @IsOptional()
  @IsIn(LIFECYCLE_TASK_STATUSES)
  status?: (typeof LIFECYCLE_TASK_STATUSES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  attachment_key?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sort_order?: number;
}

export class UpdateHrEmployeeLifecycleTaskDto extends PartialType(CreateHrEmployeeLifecycleTaskDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  completed_at?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  completed_by_user_id?: string;
}

export class MoveHrEmployeeLifecycleTaskDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  stage_id?: string;

  @ApiPropertyOptional({ enum: LIFECYCLE_TASK_STATUSES })
  @IsOptional()
  @IsIn(LIFECYCLE_TASK_STATUSES)
  status?: (typeof LIFECYCLE_TASK_STATUSES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sort_order?: number;
}

export class HrSetupDefaultsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skip?: string[];
}

