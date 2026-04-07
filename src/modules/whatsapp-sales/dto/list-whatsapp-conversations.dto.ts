import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBooleanString, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

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
  @IsUUID('4')
  owner_user_id?: string;

  @ApiPropertyOptional({ enum: ['ALL', 'MINE', 'UNASSIGNED'] })
  @IsOptional()
  @IsIn(['ALL', 'MINE', 'UNASSIGNED'])
  ownership?: string;

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
