function getPathValue(source: Record<string, unknown>, path: string): unknown {
  const segments = path
    .split('.')
    .map((item) => item.trim())
    .filter(Boolean);

  let current: unknown = source;
  for (const segment of segments) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function interpolateString(input: string, source: Record<string, unknown>): string {
  return input.replace(/{{\s*([^}]+)\s*}}/g, (_match, expr: string) => {
    const resolved = getPathValue(source, expr.trim());
    if (resolved === null || resolved === undefined) return '';
    if (typeof resolved === 'object') {
      return JSON.stringify(
        resolved,
        (_key, value) => (typeof value === 'bigint' ? value.toString() : value),
      );
    }
    return String(resolved);
  });
}

export function renderTemplateValue<T = unknown>(
  value: T,
  source: Record<string, unknown>,
): T {
  if (typeof value === 'string') {
    return interpolateString(value, source) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => renderTemplateValue(item, source)) as T;
  }

  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, val]) => {
      out[key] = renderTemplateValue(val, source);
    });
    return out as T;
  }

  return value;
}

export function parseJsonLikeObject(value: unknown): Record<string, unknown> {
  if (!value) return {};

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

