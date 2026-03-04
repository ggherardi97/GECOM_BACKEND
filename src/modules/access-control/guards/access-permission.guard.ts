import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import { ACCESS_RESOURCE_KEY } from '../decorators/access-resource.decorator';
import { AccessControlService } from '../access-control.service';

type CrudAction = 'READ' | 'CREATE' | 'UPDATE' | 'DELETE';

function mapMethodToAction(method: string): CrudAction | null {
  const normalized = String(method || '').trim().toUpperCase();
  if (normalized === 'GET' || normalized === 'HEAD' || normalized === 'OPTIONS') return 'READ';
  if (normalized === 'POST') return 'CREATE';
  if (normalized === 'PUT' || normalized === 'PATCH') return 'UPDATE';
  if (normalized === 'DELETE') return 'DELETE';
  return null;
}

@Injectable()
export class AccessPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accessControlService: AccessControlService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const resource = this.reflector.getAllAndOverride<string>(ACCESS_RESOURCE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!resource) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: any }>();
    const user = req?.user;
    if (!user) return true;

    const action = mapMethodToAction(req.method);
    if (!action) return true;

    const tenantId = String(user?.tenant_id ?? user?.tenantId ?? '').trim();
    const userId = String(user?.user_id ?? user?.userId ?? user?.id ?? user?.sub ?? '').trim();
    if (!tenantId || !userId) return true;

    const allowed = await this.accessControlService.canUserPerform({
      tenantId,
      userId,
      legacyRole: user?.role,
      resource: String(resource || '').trim().toLowerCase(),
      action,
      requestPath: String(req.originalUrl || req.url || ''),
    });

    if (allowed) return true;

    throw new ForbiddenException('Voce nao possui permissao para executar esta acao nesta entidade.');
  }
}
