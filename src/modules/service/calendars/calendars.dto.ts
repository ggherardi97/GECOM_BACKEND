import { PartialType } from '@nestjs/mapped-types';
import { CalendarExceptionType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

function normalizeTimeToIso(value: unknown): unknown {
  if (typeof value !== 'string') return value;

  const trimmed = value.trim();
  if (!trimmed) return trimmed;

  // Accept "HH:mm" and "HH:mm:ss" as aliases for a fixed ISO date.
  if (/^\d{2}:\d{2}$/.test(trimmed)) {
    return `1970-01-01T${trimmed}:00.000Z`;
  }
  if (/^\d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    return `1970-01-01T${trimmed}.000Z`;
  }

  return trimmed;
}

function normalizeDateTimeToIso(value: unknown): unknown {
  if (typeof value !== 'string') return value;

  const trimmed = value.trim();
  if (!trimmed) return trimmed;

  // Accept "YYYY-MM-DD" as start of day UTC.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed}T00:00:00.000Z`;
  }

  // Accept "YYYY-MM-DD HH:mm" / "YYYY-MM-DD HH:mm:ss".
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}$/.test(trimmed)) {
    return `${trimmed.replace(' ', 'T')}:00.000Z`;
  }
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    return `${trimmed.replace(' ', 'T')}.000Z`;
  }

  return trimmed;
}

export class CreateCalendarDto {
  @IsString()
  @MaxLength(150)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string;

  @IsOptional()
  @IsBoolean()
  is_default?: boolean;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateCalendarDto extends PartialType(CreateCalendarDto) {}

export class CreateCalendarRuleDto {
  @IsUUID()
  calendar_id: string;

  @Type(() => Number)
  @Transform(({ value, obj }) => value ?? obj?.weekday)
  @IsInt()
  @Min(0)
  @Max(6)
  day_of_week: number;

  @Transform(({ value }) => normalizeTimeToIso(value))
  @IsDateString()
  start_time: string;

  @Transform(({ value }) => normalizeTimeToIso(value))
  @IsDateString()
  end_time: string;

  @Transform(({ value, obj }) => value ?? obj?.working)
  @IsOptional()
  @IsBoolean()
  is_working_time?: boolean;

  // Backward-compatible aliases accepted from clients.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  weekday?: number;

  @IsOptional()
  @IsBoolean()
  working?: boolean;
}

export class UpdateCalendarRuleDto extends PartialType(CreateCalendarRuleDto) {}

export class CreateCalendarExceptionDto {
  @IsUUID()
  calendar_id: string;

  @Transform(({ value, obj }) => normalizeDateTimeToIso(value ?? obj?.start_at))
  @IsDateString()
  date_from: string;

  @Transform(({ value, obj }) => normalizeDateTimeToIso(value ?? obj?.end_at))
  @IsDateString()
  date_to: string;

  @IsEnum(CalendarExceptionType)
  type: CalendarExceptionType;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  notes?: string;

  // Backward-compatible aliases accepted from clients.
  @IsOptional()
  @IsDateString()
  start_at?: string;

  @IsOptional()
  @IsDateString()
  end_at?: string;
}

export class UpdateCalendarExceptionDto extends PartialType(CreateCalendarExceptionDto) {}
