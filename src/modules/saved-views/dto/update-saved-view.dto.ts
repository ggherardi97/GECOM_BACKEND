import { IsArray, IsBoolean, IsEnum, IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ViewVisibilityEnum } from './create-saved-view.dto';

export class UpdateSavedViewDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(ViewVisibilityEnum)
  visibility?: ViewVisibilityEnum;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  shared_with_user_ids?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  shared_with_role_ids?: string[];

  @IsOptional()
  @IsObject()
  definition_json?: Record<string, any>;

  /**
   * If true, sets this view as default for the current user and entity.
   */
  @IsOptional()
  @IsBoolean()
  set_as_default?: boolean;
}
