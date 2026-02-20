import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateSubjectDto {
  @IsString()
  @MaxLength(150)
  name: string;

  @IsOptional()
  @IsUUID()
  parent_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(600)
  path?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsUUID()
  default_sla_policy_id?: string;
}

export class UpdateSubjectDto extends PartialType(CreateSubjectDto) {}
