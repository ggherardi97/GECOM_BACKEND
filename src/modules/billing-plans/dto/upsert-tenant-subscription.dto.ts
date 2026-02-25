import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TenantSubscriptionStatus } from '@prisma/client';
import { IsEnum, IsISO8601, IsOptional, IsUUID, ValidateIf } from 'class-validator';

export class UpsertTenantSubscriptionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  plan_id!: string;

  @ApiPropertyOptional({ enum: TenantSubscriptionStatus, default: TenantSubscriptionStatus.ACTIVE })
  @IsOptional()
  @IsEnum(TenantSubscriptionStatus)
  status?: TenantSubscriptionStatus;

  @ApiPropertyOptional({ example: '2026-02-25T10:00:00.000Z' })
  @IsOptional()
  @IsISO8601()
  starts_at?: string;

  @ApiPropertyOptional({ example: '2026-12-31T23:59:59.000Z' })
  @IsOptional()
  @ValidateIf((_obj, value) => value !== null)
  @IsISO8601()
  ends_at?: string | null;

  @ApiPropertyOptional({ example: '2026-03-25T10:00:00.000Z' })
  @IsOptional()
  @ValidateIf((_obj, value) => value !== null)
  @IsISO8601()
  renews_at?: string | null;
}
