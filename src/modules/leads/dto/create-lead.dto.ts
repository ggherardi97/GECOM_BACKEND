import { Transform } from 'class-transformer';
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

function normalizeEnumInput(value: unknown): unknown {
  if (typeof value !== 'string') return value;

  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();

  const aliases: Record<string, string> = {
    EMPRESA: 'COMPANY',
    PESSOA: 'PERSON',
    SITE: 'WEBSITE',
    WEB: 'WEBSITE',
    INDICACAO: 'INDICATION',
    IMPORTACAO: 'IMPORT',
    NOVO: 'NEW',
    QUALIFICADO: 'QUALIFIED',
    DESQUALIFICADO: 'DISQUALIFIED',
    CONVERTIDO: 'CONVERTED',
  };

  return aliases[normalized] ?? normalized;
}

export class CreateLeadDto {
  @IsString()
  @MaxLength(255)
  name!: string;

  @Transform(({ value }) => normalizeEnumInput(value))
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

  @Transform(({ value }) => normalizeEnumInput(value))
  @IsOptional()
  @IsEnum(LeadSourceDto)
  source?: LeadSourceDto;

  @IsOptional()
  @IsUUID('4')
  owner_user_id?: string;

  @Transform(({ value }) => normalizeEnumInput(value))
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

  // Accepted for compatibility with frontend payloads.
  // Field is ignored by current persistence model.
  @IsOptional()
  @IsDateString()
  next_action_at?: string;

  @IsOptional()
  @IsUUID('4')
  converted_company_id?: string;

  @IsOptional()
  @IsUUID('4')
  converted_contact_id?: string;
}
