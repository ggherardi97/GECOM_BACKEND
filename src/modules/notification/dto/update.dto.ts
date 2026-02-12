import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { NotificationSeverityEnum } from './create.dto';

export class UpdateNotificationDTO {
  @IsOptional()
  @IsUUID()
  company_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  title?: string | null;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsEnum(NotificationSeverityEnum)
  severity?: NotificationSeverityEnum;

  @IsOptional()
  @IsDateString()
  starts_at?: string | null;

  @IsOptional()
  @IsDateString()
  expires_at?: string | null;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
