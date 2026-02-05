import { MigrationInterface, QueryRunner } from 'typeorm';

export class DocumentsDrive1769999999010 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---------------- Extensions ----------------
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // ---------------- Enums (safe) ----------------
    await queryRunner.query(`
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'document_item_type') THEN
    CREATE TYPE document_item_type AS ENUM ('FOLDER', 'FILE');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'document_upload_status') THEN
    CREATE TYPE document_upload_status AS ENUM ('PENDING', 'UPLOADED', 'FAILED');
  END IF;
END$$;
`);

    const hasDocuments = await queryRunner.hasTable('documents');

    if (!hasDocuments) {
      // ---------------- Create new table (if not exists) ----------------
      await queryRunner.query(`
CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Tenant/company that owns this drive item
  account_id uuid NOT NULL,

  -- Tree
  parent_id uuid NULL,
  item_type document_item_type NOT NULL DEFAULT 'FILE',
  name varchar(255) NOT NULL,
  path text NOT NULL,
  depth int NOT NULL DEFAULT 0,

  -- File info
  filename varchar(255) NULL,
  ext varchar(20) NULL,
  mime_type varchar(120) NULL,
  size_bytes bigint NULL,

  -- Metadata
  description varchar(500) NULL,
  external_key varchar(500) NULL,
  readonly boolean NOT NULL DEFAULT false,

  -- Link to business records
  related_table varchar(50) NULL,
  related_id uuid NULL,

  -- Storage control (future R2)
  storage_provider varchar(20) NOT NULL DEFAULT 'R2',
  bucket varchar(255) NULL,
  object_key text NULL,
  etag varchar(255) NULL,
  version varchar(255) NULL,
  upload_status document_upload_status NOT NULL DEFAULT 'PENDING',

  -- Audit
  created_by_user_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at timestamptz NULL,

  CONSTRAINT uq_documents_account_parent_name UNIQUE (account_id, parent_id, name),
  CONSTRAINT uq_documents_account_path UNIQUE (account_id, path),

  CONSTRAINT fk_documents_account FOREIGN KEY (account_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_documents_parent FOREIGN KEY (parent_id) REFERENCES documents(id) ON DELETE CASCADE,
  CONSTRAINT fk_documents_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
`);

      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_documents_account_parent" ON "documents" ("account_id", "parent_id")`);
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_documents_account_related" ON "documents" ("account_id", "related_table", "related_id")`);
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_documents_account_item_type" ON "documents" ("account_id", "item_type")`);
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_documents_account_path" ON "documents" ("account_id", "path")`);

      // updated_at trigger (same pattern)
      await queryRunner.query(`
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
`);
      await queryRunner.query(`
DROP TRIGGER IF EXISTS trg_documents_updated_at ON documents;
CREATE TRIGGER trg_documents_updated_at
BEFORE UPDATE ON documents
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
`);
      return;
    }

    // ---------------- Table exists: evolve safely ----------------

    // Add new columns (IF NOT EXISTS to be safe)
    await queryRunner.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS account_id uuid NULL`);
    await queryRunner.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS parent_id uuid NULL`);
    await queryRunner.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS item_type document_item_type NOT NULL DEFAULT 'FILE'`);
    await queryRunner.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS name varchar(255) NULL`);
    await queryRunner.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS path_text text NULL`);
    await queryRunner.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS depth int NOT NULL DEFAULT 0`);

    await queryRunner.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS filename varchar(255) NULL`);
    await queryRunner.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS ext varchar(20) NULL`);
    await queryRunner.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS mime_type varchar(120) NULL`);
    await queryRunner.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS size_bytes bigint NULL`);

    await queryRunner.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS external_key varchar(500) NULL`);
    await queryRunner.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS readonly boolean NOT NULL DEFAULT false`);

    await queryRunner.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS related_table varchar(50) NULL`);
    await queryRunner.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS related_id uuid NULL`);

    await queryRunner.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS storage_provider varchar(20) NOT NULL DEFAULT 'R2'`);
    await queryRunner.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS bucket varchar(255) NULL`);
    await queryRunner.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS object_key text NULL`);
    await queryRunner.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS etag varchar(255) NULL`);
    await queryRunner.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS version varchar(255) NULL`);
    await queryRunner.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS upload_status document_upload_status NOT NULL DEFAULT 'PENDING'`);

    await queryRunner.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS created_by_user_id uuid NULL`);
    await queryRunner.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL`);

    // ---------------- Migrate legacy data into new columns ----------------
    // Legacy columns (from your schema):
    // - file_name, company_id, path (uuid), is_folder, object_link, is_link, created_by, process_id, description, created_at/updated_at

    // 1) account_id <- company_id
    await queryRunner.query(`
UPDATE documents
SET account_id = company_id
WHERE account_id IS NULL AND company_id IS NOT NULL;
`);

    // 2) parent_id <- legacy path (uuid that pointed to parent)
    await queryRunner.query(`
UPDATE documents
SET parent_id = path
WHERE parent_id IS NULL AND path IS NOT NULL;
`);

    // 3) item_type <- is_folder
    await queryRunner.query(`
UPDATE documents
SET item_type = CASE WHEN is_folder = true THEN 'FOLDER' ELSE 'FILE' END
WHERE item_type IS NULL OR item_type NOT IN ('FOLDER','FILE');
`);

    // 4) name/filename <- legacy file_name
    await queryRunner.query(`
UPDATE documents
SET
  name = COALESCE(name, file_name),
  filename = COALESCE(filename, file_name)
WHERE file_name IS NOT NULL;
`);

    // 5) external_key <- legacy object_link (used for links / external references)
    await queryRunner.query(`
UPDATE documents
SET external_key = COALESCE(external_key, object_link)
WHERE object_link IS NOT NULL;
`);

    // 6) created_by_user_id <- legacy created_by
    await queryRunner.query(`
UPDATE documents
SET created_by_user_id = created_by
WHERE created_by_user_id IS NULL AND created_by IS NOT NULL;
`);

    // 7) related_table/related_id <- legacy process_id (best effort)
    await queryRunner.query(`
UPDATE documents
SET
  related_table = COALESCE(related_table, 'processes'),
  related_id = COALESCE(related_id, process_id)
WHERE process_id IS NOT NULL;
`);

    // 8) upload_status best effort (if it was a link, consider as uploaded)
    await queryRunner.query(`
UPDATE documents
SET upload_status = CASE WHEN is_link = true THEN 'UPLOADED' ELSE upload_status END
WHERE upload_status IS NOT NULL;
`);

    // 9) path_text: we can't reconstruct full folder tree reliably here,
    // but we create a stable unique path as a starting point.
    // Root: /<id>/<name>
    await queryRunner.query(`
UPDATE documents
SET path_text = COALESCE(path_text, '/' || id::text || '/' || COALESCE(name, file_name, 'item'))
WHERE path_text IS NULL;
`);

    // Make required new fields NOT NULL in a safe way:
    // - name/path_text must exist now; then enforce NOT NULL + unique constraints.

    await queryRunner.query(`ALTER TABLE documents ALTER COLUMN name SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE documents ALTER COLUMN path_text SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE documents ALTER COLUMN account_id SET NOT NULL`);

    // ---------------- Constraints / FKs (safe create) ----------------

    // FK account_id -> companies(id)
    await queryRunner.query(`
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_documents_account_id') THEN
    ALTER TABLE documents
    ADD CONSTRAINT fk_documents_account_id
    FOREIGN KEY (account_id) REFERENCES companies(id)
    ON DELETE CASCADE;
  END IF;
END$$;
`);

    // FK parent_id -> documents(id)
    await queryRunner.query(`
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_documents_parent_id') THEN
    ALTER TABLE documents
    ADD CONSTRAINT fk_documents_parent_id
    FOREIGN KEY (parent_id) REFERENCES documents(id)
    ON DELETE CASCADE;
  END IF;
END$$;
`);

    // FK created_by_user_id -> users(id)
    await queryRunner.query(`
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_documents_created_by_user_id') THEN
    ALTER TABLE documents
    ADD CONSTRAINT fk_documents_created_by_user_id
    FOREIGN KEY (created_by_user_id) REFERENCES users(id)
    ON DELETE SET NULL;
  END IF;
END$$;
`);

    // Unique: (account_id, parent_id, name)
    await queryRunner.query(`
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_documents_account_parent_name') THEN
    ALTER TABLE documents
    ADD CONSTRAINT uq_documents_account_parent_name
    UNIQUE (account_id, parent_id, name);
  END IF;
END$$;
`);

    // Unique: (account_id, path_text)
    await queryRunner.query(`
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_documents_account_path_text') THEN
    ALTER TABLE documents
    ADD CONSTRAINT uq_documents_account_path_text
    UNIQUE (account_id, path_text);
  END IF;
END$$;
`);

    // ---------------- Indexes ----------------
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_documents_drive_account_parent" ON "documents" ("account_id", "parent_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_documents_drive_account_related" ON "documents" ("account_id", "related_table", "related_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_documents_drive_account_item_type" ON "documents" ("account_id", "item_type")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_documents_drive_account_path_text" ON "documents" ("account_id", "path_text")`);

    // ---------------- updated_at trigger ----------------
    await queryRunner.query(`
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
`);

    await queryRunner.query(`
DROP TRIGGER IF EXISTS trg_documents_updated_at ON documents;
CREATE TRIGGER trg_documents_updated_at
BEFORE UPDATE ON documents
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // This down keeps legacy data safe.
    // If you want a strict rollback (dropping columns/constraints), I can generate it,
    // but in production it's usually safer to keep the added columns.

    // Drop trigger (safe)
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_documents_updated_at ON documents;`);

    // Constraints
    await queryRunner.query(`ALTER TABLE documents DROP CONSTRAINT IF EXISTS uq_documents_account_path_text;`);
    await queryRunner.query(`ALTER TABLE documents DROP CONSTRAINT IF EXISTS uq_documents_account_parent_name;`);
    await queryRunner.query(`ALTER TABLE documents DROP CONSTRAINT IF EXISTS fk_documents_created_by_user_id;`);
    await queryRunner.query(`ALTER TABLE documents DROP CONSTRAINT IF EXISTS fk_documents_parent_id;`);
    await queryRunner.query(`ALTER TABLE documents DROP CONSTRAINT IF EXISTS fk_documents_account_id;`);

    // Indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_documents_drive_account_parent"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_documents_drive_account_related"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_documents_drive_account_item_type"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_documents_drive_account_path_text"`);

    // Note: enums are shared types; only drop them if you’re sure nothing else uses them.
    // await queryRunner.query(`DROP TYPE IF EXISTS document_upload_status;`);
    // await queryRunner.query(`DROP TYPE IF EXISTS document_item_type;`);
  }
}
