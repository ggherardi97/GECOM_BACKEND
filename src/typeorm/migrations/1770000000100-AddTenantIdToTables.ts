import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTenantIdToTables1770000000100 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {

    // Helper to add tenant_id + FK + index safely
    const addTenantId = async (table: string) => {
      await queryRunner.query(`
        ALTER TABLE ${table}
        ADD COLUMN IF NOT EXISTS tenant_id uuid NULL
      `);

      await queryRunner.query(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_${table}_tenant'
  ) THEN
    ALTER TABLE ${table}
    ADD CONSTRAINT fk_${table}_tenant
    FOREIGN KEY (tenant_id)
    REFERENCES tenants(id)
    ON DELETE RESTRICT;
  END IF;
END$$;
`);

      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "IDX_${table}_tenant_id"
        ON "${table}" ("tenant_id")
      `);
    };

    // ---------------- Tables ----------------
    await addTenantId("users");
    await addTenantId("companies");
    await addTenantId("processes");
    await addTenantId("transports");
    await addTenantId("invoices");
    await addTenantId("invoice_lines");
    await addTenantId("products");
    await addTenantId("documents");
    await addTenantId("events");
    await addTenantId("sessions");
    await addTenantId("password_resets");
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dropTenantId = async (table: string) => {
      await queryRunner.query(`
        ALTER TABLE ${table}
        DROP CONSTRAINT IF EXISTS fk_${table}_tenant
      `);

      await queryRunner.query(`
        DROP INDEX IF EXISTS "IDX_${table}_tenant_id"
      `);

      await queryRunner.query(`
        ALTER TABLE ${table}
        DROP COLUMN IF EXISTS tenant_id
      `);
    };

    await dropTenantId("password_resets");
    await dropTenantId("sessions");
    await dropTenantId("events");
    await dropTenantId("documents");
    await dropTenantId("products");
    await dropTenantId("invoice_lines");
    await dropTenantId("invoices");
    await dropTenantId("transports");
    await dropTenantId("processes");
    await dropTenantId("companies");
    await dropTenantId("users");
  }
}
