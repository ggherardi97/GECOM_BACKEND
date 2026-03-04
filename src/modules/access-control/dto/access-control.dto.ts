import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateAccessRoleDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(2, 80)
  code?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateAccessRoleDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(2, 80)
  code?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class AccessRolePermissionItemDto {
  @IsString()
  @Length(2, 120)
  entity!: string;

  @IsOptional()
  @IsBoolean()
  can_read?: boolean;

  @IsOptional()
  @IsBoolean()
  can_create?: boolean;

  @IsOptional()
  @IsBoolean()
  can_update?: boolean;

  @IsOptional()
  @IsBoolean()
  can_delete?: boolean;
}

export class UpdateRolePermissionsDto {
  @IsArray()
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => AccessRolePermissionItemDto)
  permissions!: AccessRolePermissionItemDto[];
}

export class UpdateUserRolesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  role_ids!: string[];
}

export class ListAccessUsersQueryDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
