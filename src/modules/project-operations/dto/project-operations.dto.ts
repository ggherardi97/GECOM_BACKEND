import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PartialType } from '@nestjs/mapped-types';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const MILESTONE_STATUSES = ['PLANNED', 'DONE', 'CANCELED'] as const;
const CHECKLIST_ITEM_STATUSES = ['OPEN', 'DONE', 'BLOCKED'] as const;
const WORK_ORDER_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
const APPOINTMENT_STATUSES = ['SCHEDULED', 'DONE', 'CANCELLED', 'NO_SHOW'] as const;

export class CreatePoStatusDto {
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

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sort_order?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  is_default?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdatePoStatusDto extends PartialType(CreatePoStatusDto) {}

export class CreatePoResourceRoleDto {
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

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdatePoResourceRoleDto extends PartialType(CreatePoResourceRoleDto) {}

export class CreatePoProjectDto {
  @ApiProperty()
  @IsString()
  @MaxLength(160)
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
  status_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  start_date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  target_end_date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  actual_end_date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  owner_user_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  company_id?: string;
}

export class UpdatePoProjectDto extends PartialType(CreatePoProjectDto) {}

export class CreatePoProjectProcessDto {
  @ApiProperty()
  @IsUUID('4')
  project_id: string;

  @ApiProperty()
  @IsUUID('4')
  process_id: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sort_order?: number;
}

export class UpdatePoProjectProcessDto extends PartialType(CreatePoProjectProcessDto) {}

export class CreatePoMilestoneDto {
  @ApiProperty()
  @IsUUID('4')
  process_id: string;

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
  @IsDateString()
  due_date?: string;

  @ApiPropertyOptional({ enum: MILESTONE_STATUSES, default: 'PLANNED' })
  @IsOptional()
  @IsIn(MILESTONE_STATUSES)
  status?: (typeof MILESTONE_STATUSES)[number];

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sort_order?: number;
}

export class UpdatePoMilestoneDto extends PartialType(CreatePoMilestoneDto) {}

export class CreatePoDeliverableDto {
  @ApiProperty()
  @IsUUID('4')
  process_id: string;

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
  @IsDateString()
  due_date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  value_amount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  currency_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  status_id?: string;
}

export class UpdatePoDeliverableDto extends PartialType(CreatePoDeliverableDto) {}

export class CreatePoChecklistDto {
  @ApiProperty()
  @IsUUID('4')
  process_id: string;

  @ApiProperty()
  @IsString()
  @MaxLength(160)
  name: string;
}

export class UpdatePoChecklistDto extends PartialType(CreatePoChecklistDto) {}

export class CreatePoChecklistItemDto {
  @ApiProperty()
  @IsUUID('4')
  checklist_id: string;

  @ApiProperty()
  @IsString()
  @MaxLength(160)
  title: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_required?: boolean;

  @ApiPropertyOptional({ enum: CHECKLIST_ITEM_STATUSES, default: 'OPEN' })
  @IsOptional()
  @IsIn(CHECKLIST_ITEM_STATUSES)
  status?: (typeof CHECKLIST_ITEM_STATUSES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  assigned_user_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  due_date?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sort_order?: number;
}

export class UpdatePoChecklistItemDto extends PartialType(CreatePoChecklistItemDto) {}

export class MovePoChecklistItemDto {
  @ApiPropertyOptional({ enum: CHECKLIST_ITEM_STATUSES })
  @IsOptional()
  @IsIn(CHECKLIST_ITEM_STATUSES)
  status?: (typeof CHECKLIST_ITEM_STATUSES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sort_order?: number;
}

export class CreatePoWorkOrderDto {
  @ApiProperty()
  @IsString()
  @MaxLength(160)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  process_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  project_id?: string;

  @ApiPropertyOptional({ enum: WORK_ORDER_PRIORITIES, default: 'MEDIUM' })
  @IsOptional()
  @IsIn(WORK_ORDER_PRIORITIES)
  priority?: (typeof WORK_ORDER_PRIORITIES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  status_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  planned_start?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  planned_end?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  actual_start?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  actual_end?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  estimated_hours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  owner_user_id?: string;
}

export class UpdatePoWorkOrderDto extends PartialType(CreatePoWorkOrderDto) {}

export class CreatePoWorkOrderAssignmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  work_order_id?: string;

  @ApiProperty()
  @IsUUID('4')
  resource_id: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  role_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  allocation_percent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  planned_hours?: number;
}

export class UpdatePoWorkOrderAssignmentDto extends PartialType(CreatePoWorkOrderAssignmentDto) {}

export class CreatePoWorkOrderAppointmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  work_order_id?: string;

  @ApiProperty()
  @IsUUID('4')
  appointment_id: string;
}

export class UpdatePoWorkOrderAppointmentDto extends PartialType(CreatePoWorkOrderAppointmentDto) {}

export class GeneratePoWorkOrderAppointmentsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  start_at?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  end_at?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ enum: APPOINTMENT_STATUSES, default: 'SCHEDULED' })
  @IsOptional()
  @IsIn(APPOINTMENT_STATUSES)
  appointment_status?: (typeof APPOINTMENT_STATUSES)[number];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  resource_ids?: string[];
}

export class SetupPoDefaultsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skip?: string[];
}
