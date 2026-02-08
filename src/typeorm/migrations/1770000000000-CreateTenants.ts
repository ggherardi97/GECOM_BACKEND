import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateTenants1770000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---------------- Extensions ----------------
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // ---------------- updated_at trigger function (shared) ----------------
    await queryRunner.query(`
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
`);

    const hasTenants = await queryRunner.hasTable("tenants");
    if (!hasTenants) {
      // ---------------- Create table ----------------
      await queryRunner.query(`
CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Tenant identity
  name varchar(255) NOT NULL,
  slug varchar(80) NOT NULL,

  -- Root company of this tenant (1:1)
  company_id uuid NOT NULL,

  -- Status (1=ACTIVE, 2=INACTIVE, 3=SUSPENDED, 4=DELETED)
  status smallint NOT NULL DEFAULT 1,

  -- Audit
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at timestamptz NULL,

  CONSTRAINT uq_tenants_slug UNIQUE (slug),
  CONSTRAINT uq_tenants_company UNIQUE (company_id),

  CONSTRAINT fk_tenants_company
    FOREIGN KEY (company_id) REFERENCES companies(id)
    ON DELETE RESTRICT
);
`);

      // ---------------- Indexes ----------------
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_tenants_status" ON "tenants" ("status")`);
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_tenants_deleted_at" ON "tenants" ("deleted_at")`);

      // ---------------- Trigger ----------------
      await queryRunner.query(`
DROP TRIGGER IF EXISTS trg_tenants_updated_at ON tenants;
CREATE TRIGGER trg_tenants_updated_at
BEFORE UPDATE ON tenants
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
`);
      return;
    }

    // ---------------- Table exists: evolve safely ----------------
    // Add columns (safe)
    await queryRunner.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS name varchar(255) NULL`);
    await queryRunner.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS slug varchar(80) NULL`);
    await queryRunner.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS company_id uuid NULL`);
    await queryRunner.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS status smallint NOT NULL DEFAULT 1`);
    await queryRunner.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP`);
    await queryRunner.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP`);
    await queryRunner.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL`);

    // Enforce NOT NULL (best effort)
    // NOTE: If table already existed with data, you may need to backfill before setting NOT NULL.
    await queryRunner.query(`ALTER TABLE tenants ALTER COLUMN name SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE tenants ALTER COLUMN slug SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE tenants ALTER COLUMN company_id SET NOT NULL`);

    // Constraints (safe create)
    await queryRunner.query(`
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_tenants_slug') THEN
    ALTER TABLE tenants ADD CONSTRAINT uq_tenants_slug UNIQUE (slug);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_tenants_company') THEN
    ALTER TABLE tenants ADD CONSTRAINT uq_tenants_company UNIQUE (company_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_tenants_company') THEN
    ALTER TABLE tenants
      ADD CONSTRAINT fk_tenants_company
      FOREIGN KEY (company_id) REFERENCES companies(id)
      ON DELETE RESTRICT;
  END IF;
END$$;
`);

    // Indexes
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_tenants_status" ON "tenants" ("status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_tenants_deleted_at" ON "tenants" ("deleted_at")`);

    // Trigger
    await queryRunner.query(`
DROP TRIGGER IF EXISTS trg_tenants_updated_at ON tenants;
CREATE TRIGGER trg_tenants_updated_at
BEFORE UPDATE ON tenants
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Trigger
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_tenants_updated_at ON tenants;`);

    // Indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_tenants_deleted_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_tenants_status"`);

    // Constraints
    await queryRunner.query(`ALTER TABLE tenants DROP CONSTRAINT IF EXISTS fk_tenants_company;`);
    await queryRunner.query(`ALTER TABLE tenants DROP CONSTRAINT IF EXISTS uq_tenants_company;`);
    await queryRunner.query(`ALTER TABLE tenants DROP CONSTRAINT IF EXISTS uq_tenants_slug;`);

    // Table
    await queryRunner.query(`DROP TABLE IF EXISTS tenants;`);
  }
}