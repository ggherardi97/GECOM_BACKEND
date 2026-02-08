import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { runWithTenant } from './tenant-context';

@Injectable()
export class TenantInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();

    const tenantId =
      (req?.user?.tenant_id as string | undefined) ||
      (req?.user?.tenantId as string | undefined);

    return runWithTenant(tenantId, () => next.handle());
  }
}
