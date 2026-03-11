type HeaderValue = string | string[] | undefined;

export type PortalBrandKey = 'gecom' | 'convert';

export type PortalBrandIdentity = {
  key: PortalBrandKey;
  templateBrandName: string;
  subjectBrandName: string;
  portalBaseUrl: string;
  emailFrom: string;
};

export type RequestLike = {
  headers?: Record<string, unknown>;
};

const BRAND_GECOM: PortalBrandIdentity = {
  key: 'gecom',
  templateBrandName: 'GECOM',
  subjectBrandName: 'GECOM',
  portalBaseUrl: 'https://portalgecom.log.br',
  emailFrom: 'GECOM <no-reply@portalgecom.log.br>',
};

const BRAND_CONVERT: PortalBrandIdentity = {
  key: 'convert',
  templateBrandName: 'C+',
  subjectBrandName: 'Convert Plus',
  portalBaseUrl: 'https://convert-plus.com',
  emailFrom: 'Convert Plus <no-reply@portalgecom.log.br>',
};

function pickFirstHeaderValue(value: HeaderValue): string {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function pickHostFromHeader(value: HeaderValue): string {
  const raw = pickFirstHeaderValue(value);
  if (!raw) return '';
  const first = raw.split(',')[0]?.trim() || '';
  return first.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase();
}

function pickProtoFromHeader(value: HeaderValue): string {
  const raw = pickFirstHeaderValue(value).toLowerCase();
  if (!raw) return '';
  const first = raw.split(',')[0]?.trim() || '';
  if (first === 'http' || first === 'https') return first;
  return '';
}

export function resolvePortalBrandFromHost(hostRaw?: string | null): PortalBrandKey {
  const host = String(hostRaw || '').toLowerCase();
  if (host.includes('convert-plus.com')) return 'convert';
  return 'gecom';
}

export function resolvePortalBrandFromRequest(req?: RequestLike | null): PortalBrandKey {
  const headers = (req?.headers || {}) as Record<string, unknown>;
  const host = pickHostFromHeader(headers['x-forwarded-host'] as HeaderValue) ||
    pickHostFromHeader(headers.host as HeaderValue);
  return resolvePortalBrandFromHost(host);
}

export function getPortalBrandIdentity(brand: PortalBrandKey): PortalBrandIdentity {
  return brand === 'gecom' ? BRAND_GECOM : BRAND_CONVERT;
}

export function getPortalEmailFrom(brand: PortalBrandKey): string {
  return getPortalBrandIdentity(brand).emailFrom;
}

export function applyEmailTemplateBranding(templateHtml: string, brand: PortalBrandKey): string {
  const identity = getPortalBrandIdentity(brand);
  if (brand === 'gecom') return templateHtml;

  return String(templateHtml || '')
    .replace(/\bGECOM\b/g, identity.templateBrandName)
    .replace(/\bGecom\b/g, identity.templateBrandName)
    .replace(/G\+/g, identity.templateBrandName);
}

export function resolvePortalBaseUrlFromHost(hostRaw?: string | null, _protoRaw?: string | null): string {
  const host = pickHostFromHeader(hostRaw as HeaderValue);
  const brand = resolvePortalBrandFromHost(host);
  const identity = getPortalBrandIdentity(brand);
  return identity.portalBaseUrl;
}

export function resolvePortalBaseUrlFromRequest(req?: RequestLike | null): string {
  const headers = (req?.headers || {}) as Record<string, unknown>;
  const host = pickHostFromHeader(headers['x-forwarded-host'] as HeaderValue) ||
    pickHostFromHeader(headers.host as HeaderValue);
  const proto = pickProtoFromHeader(headers['x-forwarded-proto'] as HeaderValue) ||
    pickProtoFromHeader(headers['x-forwarded-protocol'] as HeaderValue);

  return resolvePortalBaseUrlFromHost(host, proto);
}
