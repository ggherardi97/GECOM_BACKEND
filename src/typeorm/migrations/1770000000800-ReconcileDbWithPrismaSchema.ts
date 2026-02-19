import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReconcileDbWithPrismaSchema1770000000800 implements MigrationInterface {
  name = 'ReconcileDbWithPrismaSchema1770000000800';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enums expected by Prisma schema
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_severity_enum') THEN
          CREATE TYPE notification_severity_enum AS ENUM ('INFO', 'WARNING', 'CRITICAL');
        END IF;
      END$$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum e
          JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = 'user_role_enum' AND e.enumlabel = 'MANAGER'
        ) THEN
          ALTER TYPE user_role_enum ADD VALUE 'MANAGER';
        END IF;
      END$$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum e
          JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = 'document_item_type' AND e.enumlabel = 'LINK'
        ) THEN
          ALTER TYPE document_item_type ADD VALUE 'LINK';
        END IF;
      END$$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum e
          JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = 'document_upload_status' AND e.enumlabel = 'NONE'
        ) THEN
          ALTER TYPE document_upload_status ADD VALUE 'NONE';
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_enum e
          JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname = 'document_upload_status' AND e.enumlabel = 'DELETED'
        ) THEN
          ALTER TYPE document_upload_status ADD VALUE 'DELETED';
        END IF;
      END$$;
    `);

    // Keep tenant fks detached, as in Prisma schema
    await queryRunner.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS fk_users_tenant`);
    await queryRunner.query(`ALTER TABLE companies DROP CONSTRAINT IF EXISTS fk_companies_tenant`);
    await queryRunner.query(`ALTER TABLE processes DROP CONSTRAINT IF EXISTS fk_processes_tenant`);
    await queryRunner.query(`ALTER TABLE transports DROP CONSTRAINT IF EXISTS fk_transports_tenant`);
    await queryRunner.query(`ALTER TABLE invoices DROP CONSTRAINT IF EXISTS fk_invoices_tenant`);
    await queryRunner.query(`ALTER TABLE invoice_lines DROP CONSTRAINT IF EXISTS fk_invoice_lines_tenant`);
    await queryRunner.query(`ALTER TABLE products DROP CONSTRAINT IF EXISTS fk_products_tenant`);
    await queryRunner.query(`ALTER TABLE documents DROP CONSTRAINT IF EXISTS fk_documents_tenant`);
    await queryRunner.query(`ALTER TABLE events DROP CONSTRAINT IF EXISTS fk_events_tenant`);
    await queryRunner.query(`ALTER TABLE sessions DROP CONSTRAINT IF EXISTS fk_sessions_tenant`);
    await queryRunner.query(`ALTER TABLE password_resets DROP CONSTRAINT IF EXISTS fk_password_resets_tenant`);

    // Nullability and columns aligned with Prisma models
    await queryRunner.query(`ALTER TABLE companies ALTER COLUMN tenant_id DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE companies ALTER COLUMN user_id DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE events ALTER COLUMN tenant_id DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE processes ALTER COLUMN tenant_id DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE products ALTER COLUMN tenant_id DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE invoices ALTER COLUMN tenant_id DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE invoice_lines ALTER COLUMN tenant_id DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE documents ALTER COLUMN tenant_id DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE transports ALTER COLUMN tenant_id DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE sessions ALTER COLUMN tenant_id DROP NOT NULL`);

    await queryRunner.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS company_picture bytea`);
    await queryRunner.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS related_name varchar(255)`);
    await queryRunner.query(`ALTER TABLE invoice_lines DROP COLUMN IF EXISTS created_at`);
    await queryRunner.query(`ALTER TABLE invoice_lines DROP COLUMN IF EXISTS updated_at`);

    // Documents defaults must be absent in Prisma schema
    await queryRunner.query(`ALTER TABLE documents ALTER COLUMN item_type DROP DEFAULT`);
    await queryRunner.query(`ALTER TABLE documents ALTER COLUMN storage_provider DROP DEFAULT`);
    await queryRunner.query(`ALTER TABLE documents ALTER COLUMN upload_status DROP DEFAULT`);

    // FK behaviors/names expected by Prisma mapping
    await queryRunner.query(`ALTER TABLE companies DROP CONSTRAINT IF EXISTS "FK_ee0839cba07cb0c52602021ad4b"`);
    await queryRunner.query(`
      ALTER TABLE companies
      ADD CONSTRAINT "FK_ee0839cba07cb0c52602021ad4b"
      FOREIGN KEY (user_id) REFERENCES users(id)
      ON DELETE SET NULL ON UPDATE CASCADE
    `);

    await queryRunner.query(`ALTER TABLE documents DROP CONSTRAINT IF EXISTS fk_documents_parent`);
    await queryRunner.query(`ALTER TABLE documents DROP CONSTRAINT IF EXISTS "FK_documents_parent_id"`);
    await queryRunner.query(`
      ALTER TABLE documents
      ADD CONSTRAINT "FK_documents_parent_id"
      FOREIGN KEY (parent_id) REFERENCES documents(id)
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(`ALTER TABLE documents DROP CONSTRAINT IF EXISTS fk_documents_account`);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_documents_account') THEN
          ALTER TABLE documents RENAME CONSTRAINT fk_documents_account TO "FK_documents_account_id";
        END IF;
      END$$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_documents_created_by') THEN
          ALTER TABLE documents RENAME CONSTRAINT fk_documents_created_by TO "FK_documents_created_by_user_id";
        END IF;
      END$$;
    `);

    // Remove tenant-lockdown indexes/uniques and recreate schema-defined ones
    await queryRunner.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS uq_users_tenant_email`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_users_tenant_email"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_tenant_role"`);
    await queryRunner.query(`ALTER TABLE processes DROP CONSTRAINT IF EXISTS uq_processes_tenant_process_number`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_processes_tenant_process_number"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_processes_tenant_company"`);
    await queryRunner.query(`ALTER TABLE products DROP CONSTRAINT IF EXISTS uq_products_tenant_product_code`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_products_tenant_product_code"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_products_tenant_active"`);
    await queryRunner.query(`ALTER TABLE invoices DROP CONSTRAINT IF EXISTS uq_invoices_tenant_invoice_number`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_invoices_tenant_invoice_number"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_invoices_tenant_company_status"`);
    await queryRunner.query(`ALTER TABLE documents DROP CONSTRAINT IF EXISTS uq_documents_account_parent_name`);
    await queryRunner.query(`ALTER TABLE documents DROP CONSTRAINT IF EXISTS uq_documents_account_path`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_documents_account_parent_name"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_documents_account_path"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_documents_account_item_type"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_documents_account_parent"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_documents_account_path"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_documents_account_related"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_documents_tenant_account"`);

    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_97672ac88f789774dd47f7c8be3" ON users(email)`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "processes_process_number_key" ON processes(process_number)`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "uq_products_product_code" ON products(product_code)`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_d8f8d3788694e1b3f96c42c36fb" ON invoices(invoice_number)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_DOCUMENTS_ACCOUNT" ON documents(account_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_DOCUMENTS_PARENT" ON documents(parent_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_DOCUMENTS_RELATED" ON documents(related_table, related_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_DOCUMENTS_ITEM_TYPE" ON documents(item_type)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_DOCUMENTS_DELETED_AT" ON documents(deleted_at)`);

    // Notifications models missing in DB
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id uuid NOT NULL,
        company_id uuid NOT NULL,
        title varchar(150) NULL,
        message text NOT NULL,
        severity notification_severity_enum NOT NULL DEFAULT 'INFO',
        starts_at timestamp(6) NULL,
        expires_at timestamp(6) NULL,
        is_active boolean NOT NULL DEFAULT true,
        created_by_user_id uuid NULL,
        created_at timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS notification_reads (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id uuid NOT NULL,
        notification_id uuid NOT NULL,
        user_id uuid NOT NULL,
        read_at timestamp(6) NULL,
        created_at timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_company_id_fkey') THEN
          ALTER TABLE notifications
          ADD CONSTRAINT notifications_company_id_fkey
          FOREIGN KEY (company_id) REFERENCES companies(id)
          ON DELETE RESTRICT ON UPDATE NO ACTION;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_created_by_user_id_fkey') THEN
          ALTER TABLE notifications
          ADD CONSTRAINT notifications_created_by_user_id_fkey
          FOREIGN KEY (created_by_user_id) REFERENCES users(id)
          ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_reads_notification_id_fkey') THEN
          ALTER TABLE notification_reads
          ADD CONSTRAINT notification_reads_notification_id_fkey
          FOREIGN KEY (notification_id) REFERENCES notifications(id)
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_reads_user_id_fkey') THEN
          ALTER TABLE notification_reads
          ADD CONSTRAINT notification_reads_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES users(id)
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END$$;
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_notifications_tenant_company_active" ON notifications(tenant_id, company_id, is_active)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_notifications_tenant_company_expires" ON notifications(tenant_id, company_id, expires_at)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_notifications_tenant_company_starts" ON notifications(tenant_id, company_id, starts_at)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_notification_reads_tenant_user_readat" ON notification_reads(tenant_id, user_id, read_at)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_notification_reads_tenant_notification" ON notification_reads(tenant_id, notification_id)`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_notification_reads_notification_user" ON notification_reads(notification_id, user_id)`);
  }

  public async down(): Promise<void> {
    // Intentionally omitted (reconciliation migration).
  }
}
