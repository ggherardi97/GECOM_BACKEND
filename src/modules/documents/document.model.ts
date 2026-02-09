
/**
 * Lightweight model type for API documentation / future expansion.
 * Prisma types are still used in return types (documents).
 */
export interface DocumentModel {
  id: string;
  tenant_id: string;

  account_id: string;
  parent_id?: string | null;

  item_type: string;
  name?: string | null;
  filename?: string | null;
  ext?: string | null;
  mime_type?: string | null;

  storage_provider?: string | null;
  upload_status?: string | null;

  object_key?: string | null;
  external_key?: string | null;
  etag?: string | null;

  size_bytes?: string | number | null;

  related_table?: string | null;
  related_id?: string | null;

  // Human-friendly label resolved on create/update (e.g., company_name, process_number)
  related_name?: string | null;

  created_at: string;
  updated_at: string;
}

