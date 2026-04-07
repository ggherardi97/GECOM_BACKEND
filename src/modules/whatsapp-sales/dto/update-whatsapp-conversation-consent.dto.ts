import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateWhatsappConversationConsentDto {
  @ApiPropertyOptional({ enum: ['UNKNOWN', 'OPTED_IN', 'OPTED_OUT'] })
  @IsOptional()
  @IsIn(['UNKNOWN', 'OPTED_IN', 'OPTED_OUT'])
  marketing_opt_in_status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  marketing_opt_in_source?: string | null;
}
