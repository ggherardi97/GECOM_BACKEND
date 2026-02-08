import { AsyncLocalStorage } from 'node:async_hooks';

type TenantStore = {
  tenantId?: string;
};

const als = new AsyncLocalStorage<TenantStore>();

export function runWithTenant<T>(tenantId: string | undefined, fn: () => T): T {
  return als.run({ tenantId }, fn);
}

export function getTenantId(): string | undefined {
  return als.getStore()?.tenantId;
}
