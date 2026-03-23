import { UnauthorizedException } from '@nestjs/common';

export type AuthRequest = Request & {
  user?: {
    tenant_id?: string;
    user_id?: string;
    sub?: string;
    id?: string;
    role?: string;
  };
};

export function getTenantId(req: AuthRequest): string {
  const tenantId = req.user?.tenant_id;
  if (!tenantId) throw new UnauthorizedException('tenant_id ausente no token.');
  return tenantId;
}

export function getUserId(req: AuthRequest): string {
  const userId = req.user?.user_id ?? req.user?.sub ?? req.user?.id;
  if (!userId) throw new UnauthorizedException('user_id ausente no token.');
  return userId;
}

export function getAuthUser(req: AuthRequest): { id: string; tenant_id: string; role?: string } {
  return {
    id: getUserId(req),
    tenant_id: getTenantId(req),
    role: req.user?.role ? String(req.user.role) : undefined,
  };
}
