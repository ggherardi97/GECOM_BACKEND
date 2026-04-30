import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

function trimText(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeToken(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function normalizeOperationMode(value: unknown): string {
  const token = normalizeToken(value);
  const map: Record<string, string> = {
    'USO DESPACHANTE ADUANEIRO': 'Uso despachante aduaneiro',
    'USO TRADING COMPANY': 'Uso trading company',
    'USO CONSULTORIA': 'Uso consultoria',
    'EQUIPE PROPRIA': 'Equipe própria',
    'AINDA NAO IMPORTO': 'Ainda não importo',
  };
  return map[token] ?? trimText(value);
}

function normalizeImportVolume(value: unknown): string {
  const token = normalizeToken(value);
  const map: Record<string, string> = {
    'ATE R$ 100 MIL': 'Até R$ 100 mil',
    'ATE R$100 MIL': 'Até R$ 100 mil',
    'R$ 100 MIL A R$ 500 MIL': 'R$ 100 mil a R$ 500 mil',
    'R$100 MIL A R$500 MIL': 'R$ 100 mil a R$ 500 mil',
    'ACIMA DE R$ 500 MIL': 'Acima de R$ 500 mil',
    'ACIMA DE R$500 MIL': 'Acima de R$ 500 mil',
  };
  return map[token] ?? trimText(value);
}

export class CreatePublicGecomLeadDto {
  @Transform(({ value }) => trimText(value))
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name!: string;

  @Transform(({ value }) => trimText(value))
  @IsString()
  @MinLength(8)
  @MaxLength(50)
  phone!: string;

  @Transform(({ value }) => trimText(value))
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  company!: string;

  @Transform(({ value }) => normalizeOperationMode(value))
  @IsString()
  @IsIn([
    'Uso despachante aduaneiro',
    'Uso trading company',
    'Uso consultoria',
    'Equipe própria',
    'Ainda não importo',
  ])
  operation_mode!: string;

  @Transform(({ value }) => normalizeImportVolume(value))
  @IsString()
  @IsIn([
    'Até R$ 100 mil',
    'Ate R$ 100 mil',
    'Até R$100 mil',
    'Ate R$100 mil',
    'R$ 100 mil a R$ 500 mil',
    'R$100 mil a R$500 mil',
    'Acima de R$ 500 mil',
    'Acima de R$500 mil',
  ])
  import_volume!: string;

  @Transform(({ value }) => trimText(value))
  @IsOptional()
  @IsString()
  @MaxLength(60)
  form_context?: string;
}
