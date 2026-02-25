import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpsertTenantModuleOverrideDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  enabled!: boolean;

  @ApiPropertyOptional({ example: 'Habilitado manualmente para negociacao.' })
  @IsOptional()
  @IsString()
  reason?: string | null;
}
