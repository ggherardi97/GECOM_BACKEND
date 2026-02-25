import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";

function isDecimalLike(value: any): boolean {
  if (!value || typeof value !== "object") return false;
  const ctorName = value?.constructor?.name;
  if (ctorName === "Decimal" && typeof value.toString === "function") return true;
  if (
    Object.prototype.hasOwnProperty.call(value, "s") &&
    Object.prototype.hasOwnProperty.call(value, "e") &&
    Object.prototype.hasOwnProperty.call(value, "d") &&
    Array.isArray((value as any).d) &&
    typeof (value as any).toString === "function"
  ) {
    return true;
  }
  return false;
}

function convertBigInt(value: any): any {
  if (value === null || value === undefined) return value;

  if (value instanceof Date) return value.toISOString();

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (isDecimalLike(value)) {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map(convertBigInt);
  }

  if (typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) out[k] = convertBigInt(v);
    return out;
  }

  return value;
}

@Injectable()
export class BigIntJsonInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(map((data) => convertBigInt(data)));
  }
}
