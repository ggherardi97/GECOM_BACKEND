import { BadRequestException } from '@nestjs/common';
import {
  MetadataFieldDataType,
  MetadataMaskMode,
  MetadataPrincipalType,
} from './metadata-designer.types';

const SAFE_IDENTIFIER_REGEX = /^[a-z_][a-z0-9_]*$/;

export function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

export function normalizeIdentifier(value: unknown, fallback?: string): string {
  const normalized = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  return normalized || String(fallback || '');
}

export function ensureSafeIdentifier(value: unknown, fieldName = 'identifier'): string {
  const id = normalizeText(value).toLowerCase();
  if (!SAFE_IDENTIFIER_REGEX.test(id)) {
    throw new BadRequestException(`${fieldName} is invalid. Use [a-z_][a-z0-9_]*.`);
  }
  return id;
}

export function toPtBrLabel(value: string): string {
  return String(value || '')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function isAdminRole(role: unknown): boolean {
  return normalizeText(role).toUpperCase() === 'ADMIN';
}

export function normalizeDataType(value: unknown): MetadataFieldDataType {
  const normalized = normalizeText(value).toUpperCase() as MetadataFieldDataType;
  const allowed: MetadataFieldDataType[] = [
    'STRING',
    'TEXT',
    'INT',
    'DECIMAL',
    'BOOLEAN',
    'DATE',
    'DATETIME',
    'UUID',
    'JSONB',
    'LOOKUP',
  ];
  if (!allowed.includes(normalized)) {
    throw new BadRequestException(`Unsupported data_type: ${normalized || '(empty)'}`);
  }
  return normalized;
}

export function normalizePrincipalType(value: unknown): MetadataPrincipalType {
  const normalized = normalizeText(value).toUpperCase() as MetadataPrincipalType;
  if (normalized !== 'ROLE' && normalized !== 'USER') {
    throw new BadRequestException('principal_type must be ROLE or USER.');
  }
  return normalized;
}

export function normalizeMaskMode(value: unknown, fallback: MetadataMaskMode = 'HIDDEN_TEXT'): MetadataMaskMode {
  const normalized = normalizeText(value).toUpperCase() as MetadataMaskMode;
  if (!normalized) return fallback;
  if (normalized !== 'NONE' && normalized !== 'STARS' && normalized !== 'HIDDEN_TEXT') {
    throw new BadRequestException('mask_mode must be NONE, STARS or HIDDEN_TEXT.');
  }
  return normalized;
}

export function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

export function clampPriority(value: unknown, fallback = 100): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(100000, Math.trunc(parsed)));
}

