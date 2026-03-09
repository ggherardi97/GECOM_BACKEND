import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import { MetadataAuthUser } from './metadata-designer.types';

export function getMetadataAuthUser(req: Request): MetadataAuthUser {
  const user = ((req as any)?.user ?? {}) as any;
  const id = String(user.id ?? user.user_id ?? user.userId ?? user.sub ?? '').trim();
  const tenantId = String(user.tenant_id ?? user.tenantId ?? '').trim();
  const role = String(user.role ?? '').trim();

  if (!id || !tenantId) {
    throw new BadRequestException('Contexto de autenticacao ausente: req.user.id / req.user.tenant_id');
  }

  return { id, tenant_id: tenantId, role };
}

