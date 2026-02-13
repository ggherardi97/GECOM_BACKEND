import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export enum LeadTypeDto {
  COMPANY = 'COMPANY',
  PERSON = 'PERSON',
}

export enum LeadSourceDto {
  MANUAL = 'MANUAL',
  WEBSITE = 'WEBSITE',
  INDICATION = 'INDICATION',
  IMPORT = 'IMPORT',
  OTHER = 'OTHER',
}

export enum LeadStatusDto {
  NEW = 'NEW',
  WORKING = 'WORKING',
  QUALIFIED = 'QUALIFIED',
  DISQUALIFIED = 'DISQUALIFIED',
  CONVERTED = 'CONVERTED',
}

export class CreateLeadDto {
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsEnum(LeadTypeDto)
  type!: LeadTypeDto;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  company_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  first_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  last_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  website?: string;

  @IsOptional()
  @IsEnum(LeadSourceDto)
  source?: LeadSourceDto;

  @IsOptional()
  @IsUUID('4')
  owner_user_id?: string;

  @IsOptional()
  @IsEnum(LeadStatusDto)
  status?: LeadStatusDto;

  @IsOptional()
  @IsUUID('4')
  stage_id?: string;

  @IsOptional()
  @IsString()
  disqualify_reason?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  estimated_value?: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency_code?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsDateString()
  converted_at?: string;

  @IsOptional()
  @IsUUID('4')
  converted_company_id?: string;

  @IsOptional()
  @IsUUID('4')
  converted_contact_id?: string;
}
