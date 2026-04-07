import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class LaunchWhatsappCampaignDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  resend_failed?: boolean;
}
