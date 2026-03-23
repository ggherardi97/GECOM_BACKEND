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
    const userId =
      (req?.user?.id as string | undefined) ||
      (req?.user?.user_id as string | undefined) ||
      (req?.user?.userId as string | undefined) ||
      (req?.user?.sub as string | undefined);

    return new Observable((subscriber) =>
      runWithTenant(tenantId, () => {
        const stream = next.handle();
        const subscription = stream.subscribe({
          next: (value) => subscriber.next(value),
          error: (error) => subscriber.error(error),
          complete: () => subscriber.complete(),
        });

        return () => subscription.unsubscribe();
      }, userId),
    );
  }
}
