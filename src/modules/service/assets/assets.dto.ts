import { PartialType } from '@nestjs/mapped-types';
import { AssetStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateAssetDto {
  @IsUUID()
  company_id: string;

  @IsString()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  asset_tag?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  serial_number?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  @IsOptional()
  @IsEnum(AssetStatus)
  status?: AssetStatus;

  @IsOptional()
  @IsDateString()
  purchase_date?: string;

  @IsOptional()
  @IsDateString()
  warranty_end_date?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateAssetDto extends PartialType(CreateAssetDto) {}
