import { MigrationInterface, QueryRunner } from 'typeorm';

export class FinalizePrismaSchemaReconcile1770000000900 implements MigrationInterface {
  name = 'FinalizePrismaSchemaReconcile1770000000900';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Remove indexes that are not part of schema.prisma
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_companies_tenant_deleted"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_events_tenant_type"`);

    // FK names/definitions expected by Prisma schema
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_users_company_id') THEN
          ALTER TABLE users
          ADD CONSTRAINT "FK_users_company_id"
          FOREIGN KEY (company_id) REFERENCES companies(id)
          ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
      END$$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_documents_account_id') THEN
          ALTER TABLE documents
          ADD CONSTRAINT "FK_documents_account_id"
          FOREIGN KEY (account_id) REFERENCES companies(id)
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END$$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_tenants_company') THEN
          ALTER TABLE tenants RENAME CONSTRAINT fk_tenants_company TO tenants_company_id_fkey;
        END IF;
      END$$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_da40c9199f1d9103120cb15fa35') THEN
          ALTER TABLE saved_views RENAME CONSTRAINT "FK_da40c9199f1d9103120cb15fa35" TO "FK_saved_views_owner_user_id";
        END IF;
      END$$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_4e355667e6c1fa314a7a495bb8f') THEN
          ALTER TABLE user_default_views RENAME CONSTRAINT "FK_4e355667e6c1fa314a7a495bb8f" TO "FK_user_default_views_user_id";
        END IF;
      END$$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_69b151d97de21f2bb3891143240') THEN
          ALTER TABLE user_default_views RENAME CONSTRAINT "FK_69b151d97de21f2bb3891143240" TO "FK_user_default_views_saved_view_id";
        END IF;
      END$$;
    `);

    // PK and index names expected by Prisma schema mapping
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documents_pkey') THEN
          ALTER TABLE documents RENAME CONSTRAINT documents_pkey TO "PK_documents";
        END IF;
      END$$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PK_30acd4fbe2058d97631ab9bb2b6') THEN
          ALTER TABLE saved_views RENAME CONSTRAINT "PK_30acd4fbe2058d97631ab9bb2b6" TO saved_views_pkey;
        END IF;
      END$$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PK_2e6976b14ad51f8228dec081204') THEN
          ALTER TABLE user_default_views RENAME CONSTRAINT "PK_2e6976b14ad51f8228dec081204" TO user_default_views_pkey;
        END IF;
      END$$;
    `);

    await queryRunner.query(`ALTER INDEX IF EXISTS "uq_tenants_company" RENAME TO "tenants_company_id_key"`);
    await queryRunner.query(`ALTER INDEX IF EXISTS "UQ_f7a4c3bc48f24df007936d217be" RENAME TO "UQ_password_resets_user_id"`);
    await queryRunner.query(`ALTER INDEX IF EXISTS "uq_invoice_lines_invoice_line" RENAME TO "uq_invoice_lines_invoice_line_number"`);
    await queryRunner.query(`ALTER INDEX IF EXISTS "IDX_saved_views_owner" RENAME TO "IDX_saved_views_owner_user_id"`);

    // Missing indexes in current DB
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_saved_views_tenant_id" ON saved_views(tenant_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_saved_views_entity_name" ON saved_views(entity_name)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_saved_views_visibility" ON saved_views(visibility)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_saved_views_is_active" ON saved_views(is_active)`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_saved_views_owner_name" ON saved_views(tenant_id, entity_name, owner_user_id, name)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_user_default_views_tenant_id" ON user_default_views(tenant_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_user_default_views_saved_view_id" ON user_default_views(saved_view_id)`);

    // Timestamp precision/type alignment (timestamp without time zone)
    await queryRunner.query(`ALTER TABLE boards ALTER COLUMN created_at TYPE timestamp(6), ALTER COLUMN updated_at TYPE timestamp(6)`);
    await queryRunner.query(`ALTER TABLE board_columns ALTER COLUMN created_at TYPE timestamp(6), ALTER COLUMN updated_at TYPE timestamp(6)`);
    await queryRunner.query(`ALTER TABLE board_cards ALTER COLUMN due_date TYPE timestamp(6), ALTER COLUMN start_date TYPE timestamp(6), ALTER COLUMN created_at TYPE timestamp(6), ALTER COLUMN updated_at TYPE timestamp(6), ALTER COLUMN completed_at TYPE timestamp(6)`);
    await queryRunner.query(`ALTER TABLE board_tags ALTER COLUMN created_at TYPE timestamp(6)`);
    await queryRunner.query(`ALTER TABLE board_card_tags ALTER COLUMN created_at TYPE timestamp(6)`);
    await queryRunner.query(`ALTER TABLE board_card_comments ALTER COLUMN created_at TYPE timestamp(6)`);
    await queryRunner.query(`ALTER TABLE board_card_audit ALTER COLUMN created_at TYPE timestamp(6)`);
    await queryRunner.query(`ALTER TABLE board_card_assignees ALTER COLUMN created_at TYPE timestamp(6)`);
    await queryRunner.query(`ALTER TABLE lead_pipeline_stages ALTER COLUMN created_at TYPE timestamp(6), ALTER COLUMN updated_at TYPE timestamp(6)`);
    await queryRunner.query(`ALTER TABLE leads ALTER COLUMN converted_at TYPE timestamp(6), ALTER COLUMN created_at TYPE timestamp(6), ALTER COLUMN updated_at TYPE timestamp(6)`);
    await queryRunner.query(`ALTER TABLE lead_stage_history ALTER COLUMN changed_at TYPE timestamp(6)`);
    await queryRunner.query(`ALTER TABLE lead_activities ALTER COLUMN due_date TYPE timestamp(6), ALTER COLUMN completed_at TYPE timestamp(6), ALTER COLUMN created_at TYPE timestamp(6), ALTER COLUMN updated_at TYPE timestamp(6)`);
    await queryRunner.query(`ALTER TABLE lead_tags ALTER COLUMN created_at TYPE timestamp(6)`);
    await queryRunner.query(`ALTER TABLE lead_tag_links ALTER COLUMN created_at TYPE timestamp(6)`);
  }

  public async down(): Promise<void> {
    // Intentionally omitted (final reconciliation migration).
  }
}
