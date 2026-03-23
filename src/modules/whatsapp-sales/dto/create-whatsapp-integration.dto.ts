import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateWhatsappIntegrationDto {
  @ApiProperty({ example: 'WhatsApp Comercial' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({ example: 'IAZAP', default: 'IAZAP' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  provider?: string;

  @ApiProperty({ example: 'https://api.iazapapi.com.br/api-XXX/v2' })
  @IsString()
  @IsNotEmpty()
  api_base_url!: string;

  @ApiProperty({ example: 'sua_api_key' })
  @IsString()
  @IsNotEmpty()
  api_key!: string;

  @ApiPropertyOptional({ example: 'convert-plus-main' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  session_name?: string;

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
  webhook_secret?: string;

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
