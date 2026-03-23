import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class ProvisionWhatsappIntegrationDto {
  @ApiPropertyOptional({ example: 'WhatsApp Comercial' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional({ example: '5511999999999' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone_number?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  default_owner_user_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  default_stage_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  classifier_prompt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  auto_reply_prompt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fallback_reply_text?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  settings_json?: Record<string, unknown>;
}
