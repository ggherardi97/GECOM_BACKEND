import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class PutMenuConfigDto {
  @IsObject()
  config_json!: Record<string, any>;
}

export class PutThemeSettingsDto {
  @IsOptional()
  @IsString()
  primary_color?: string;

  @IsOptional()
  @IsString()
  nav_bg_color?: string;

  @IsOptional()
  @IsString()
  nav_text_color?: string;

  @IsOptional()
  @IsString()
  topbar_bg_color?: string;

  @IsOptional()
  @IsString()
  @IsIn(['LIGHT', 'DARK'])
  layout_mode?: string;

  @IsOptional()
  @IsString()
  logo_url?: string;

  @IsOptional()
  @IsString()
  favicon_url?: string;
}

export class CreateOptionSetDto {
  @IsString()
  entity!: string;

  @IsString()
  field!: string;
}

export class CreateOptionSetOptionDto {
  @IsString()
  value!: string;

  @IsString()
  label!: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsInt()
  sort_order?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateOptionSetOptionDto {
  @IsOptional()
  @IsString()
  value?: string;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsInt()
  sort_order?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class ToggleOptionActiveDto {
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class CreateEmailIntegrationDto {
  @IsString()
  @IsIn(['GMAIL', 'OUTLOOK', 'SMTP'])
  provider!: string;

  @IsString()
  display_name!: string;

  @IsEmail()
  sender_email!: string;

  @IsOptional()
  @IsString()
  client_id?: string;

  @IsOptional()
  @IsString()
  client_secret?: string;

  @IsOptional()
  @IsString()
  tenant_domain?: string;

  @IsOptional()
  @IsString()
  smtp_host?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  smtp_port?: number;

  @IsOptional()
  @IsString()
  smtp_user?: string;

  @IsOptional()
  @IsString()
  smtp_password?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateEmailIntegrationDto {
  @IsOptional()
  @IsString()
  @IsIn(['GMAIL', 'OUTLOOK', 'SMTP'])
  provider?: string;

  @IsOptional()
  @IsString()
  display_name?: string;

  @IsOptional()
  @IsEmail()
  sender_email?: string;

  @IsOptional()
  @IsString()
  client_id?: string;

  @IsOptional()
  @IsString()
  client_secret?: string;

  @IsOptional()
  @IsString()
  tenant_domain?: string;

  @IsOptional()
  @IsString()
  smtp_host?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  smtp_port?: number;

  @IsOptional()
  @IsString()
  smtp_user?: string;

  @IsOptional()
  @IsString()
  smtp_password?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class ToggleEmailIntegrationDto {
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class TestEmailIntegrationDto {
  @IsOptional()
  @IsUUID()
  integration_id?: string;

  @IsOptional()
  @IsString()
  smtp_host?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  smtp_port?: number;

  @IsOptional()
  @IsString()
  smtp_user?: string;

  @IsOptional()
  @IsString()
  smtp_password?: string;
}
