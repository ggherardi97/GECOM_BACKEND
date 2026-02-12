import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from 'class-validator';

export enum BoardEntityTypeDto {
  NONE = 'NONE',
  COMPANY = 'COMPANY',
  PROCESS = 'PROCESS',
  INVOICE = 'INVOICE',
}

export enum BoardVisibilityDto {
  PRIVATE = 'PRIVATE',
  SHARED = 'SHARED',
  PUBLIC = 'PUBLIC',
}

export class CreateBoardColumnDto {
  @IsString()
  @MaxLength(150)
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sort_order?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  wip_limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  color?: string;

  @IsOptional()
  @IsBoolean()
  is_done?: boolean;
}

export class CreateBoardDto {
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(BoardEntityTypeDto)
  entity_type?: BoardEntityTypeDto;

  @IsOptional()
  @IsUUID('4')
  company_id?: string;

  @IsOptional()
  @IsUUID('4')
  process_id?: string;

  @IsOptional()
  @IsUUID('4')
  invoice_id?: string;

  @IsOptional()
  @IsEnum(BoardVisibilityDto)
  visibility?: BoardVisibilityDto;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateBoardColumnDto)
  columns?: CreateBoardColumnDto[];
}
