import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";

function convertBigInt(value: any): any {
  if (value === null || value === undefined) return value;

  if (typeof value === "bigint") {
    // safest: string (keeps full precision)
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