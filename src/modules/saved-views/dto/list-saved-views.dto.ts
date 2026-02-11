import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class ListSavedViewsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  entity_name?: string;

  /**
   * If true, includes inactive views (admin/debug usage).
   */
  @IsOptional()
  @IsBoolean()
  include_inactive?: boolean;
}
