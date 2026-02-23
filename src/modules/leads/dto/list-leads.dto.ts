import { IsOptional, IsString, IsUUID } from 'class-validator';

export class ListLeadsQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsUUID('4')
  status_config_id?: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsUUID('4')
  owner_user_id?: string;

  @IsOptional()
  @IsUUID('4')
  stage_id?: string;
}
