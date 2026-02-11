import { IsArray, IsBoolean, IsEnum, IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export enum ViewVisibilityEnum {
  PRIVATE = 'PRIVATE',
  SHARED = 'SHARED',
  PUBLIC = 'PUBLIC',
}

export class CreateSavedViewDto {
  @IsString()
  @MaxLength(100)
  entity_name!: string;

  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(ViewVisibilityEnum)
  visibility?: ViewVisibilityEnum;

  /**
   * Used only when visibility=SHARED.
   * Stored in saved_views.shared_with_user_ids (jsonb).
   */
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  shared_with_user_ids?: string[];

  /**
   * Used only when visibility=SHARED.
   * Stored in saved_views.shared_with_role_ids (jsonb).
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  shared_with_role_ids?: string[];

  /**
   * View definition JSON (columns, filters, sort, pageSize, etc).
   */
  @IsObject()
  definition_json!: Record<string, any>;

  /**
   * If true, sets this view as default for the current user and entity.
   */
  @IsOptional()
  @IsBoolean()
  set_as_default?: boolean;
}
