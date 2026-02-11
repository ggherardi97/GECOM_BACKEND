/**
 * Shared request-user shape used by this module.
 * Adjust this if your AuthGuard sets a different structure on req.user.
 */
export type RequestUser = {
  id: string;
  tenant_id: string;
  role?: string;
};
