import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBooleanString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ListWhatsappConversationsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  integration_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  intent?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBooleanString()
  lead_linked?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  q?: string;
}
