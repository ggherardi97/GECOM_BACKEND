
/**
 * Lightweight model type for API documentation / future expansion.
 * Prisma types are still used in return types (documents).
 */
export interface DocumentModel {
  id: string;
  company_id: string;
  created_by_user_id?: string | null;

  name: string;
  description?: string | null;

  mime_type?: string | null;
  size_bytes?: number | null;

  external_key?: string | null;

  is_folder: boolean;
  readonly: boolean;

  parent_id?: string | null;
  parent_path?: string | null;
  folder_name?: string | null;

  related_table?: string | null;
  related_id?: string | null;

  r2_bucket?: string | null;
  r2_key?: string | null;
  r2_etag?: string | null;
  r2_version_id?: string | null;

  checksum_sha256?: string | null;

  uploaded_at?: Date | null;

  created_at: Date;
  updated_at: Date;
  deleted_at?: Date | null;
}
