import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateWhatsappCampaignDto {
  @ApiProperty()
  @IsUUID('4')
  integration_id!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  template_id?: string | null;

  @ApiProperty()
  @IsString()
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  audience_mode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  message_text?: string;

  @ApiPropertyOptional()
  @IsOptional()
  filters_json?: Record<string, unknown> | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  recipients?: Array<Record<string, unknown>>;
}
