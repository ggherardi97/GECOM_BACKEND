import { AsyncLocalStorage } from 'node:async_hooks';

type TenantStore = {
  tenantId?: string;
  userId?: string;
};

const als = new AsyncLocalStorage<TenantStore>();

export function runWithTenant<T>(tenantId: string | undefined, fn: () => T, userId?: string): T {
  return als.run({ tenantId, userId }, fn);
}

export function getTenantId(): string | undefined {
  return als.getStore()?.tenantId;
}

export function getUserId(): string | undefined {
  return als.getStore()?.userId;
}
