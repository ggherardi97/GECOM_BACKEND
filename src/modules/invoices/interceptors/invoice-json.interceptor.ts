import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Detects Prisma Decimal-like objects (including the internal shape { s, e, d }).
 * We avoid importing Prisma runtime types here to prevent build/runtime issues.
 */
function isDecimalLike(value: any): boolean {
  if (!value || typeof value !== 'object') return false;

  const ctorName = value?.constructor?.name;
  if (ctorName === 'Decimal' && typeof value.toString === 'function') return true;

  if (
    Object.prototype.hasOwnProperty.call(value, 's') &&
    Object.prototype.hasOwnProperty.call(value, 'e') &&
    Object.prototype.hasOwnProperty.call(value, 'd') &&
    Array.isArray((value as any).d)
  ) {
    return typeof value.toString === 'function';
  }

  return false;
}

function convertInvoiceJson(value: any): any {
  if (value === null || value === undefined) return value;

  // ✅ Preserve Date (otherwise it becomes {} when iterating entries)
  if (value instanceof Date) return value.toISOString();

  // BigInt -> string (JSON can't serialize BigInt)
  if (typeof value === 'bigint') return value.toString();

  // Decimal -> string (keeps precision; frontend can format)
  if (isDecimalLike(value)) return value.toString();

  if (Array.isArray(value)) return value.map(convertInvoiceJson);

  // ✅ Keep plain objects conversion
  if (typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) out[k] = convertInvoiceJson(v);
    return out;
  }

  return value;
}

@Injectable()
export class InvoiceJsonInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(map((data) => convertInvoiceJson(data)));
  }
}
