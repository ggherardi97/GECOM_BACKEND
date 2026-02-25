import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class AdminOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const role = String(request?.user?.role ?? '').trim().toUpperCase();

    if (role !== 'ADMIN') {
      throw new ForbiddenException('Acesso permitido apenas para administradores.');
    }

    return true;
  }
}
