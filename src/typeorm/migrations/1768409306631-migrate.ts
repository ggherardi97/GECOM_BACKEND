import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCompanyIdToUsers1761419999999 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "company_id" uuid NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_users_company_id"
      ON "users" ("company_id")
    `);

    // ✅ Postgres does NOT support: ADD CONSTRAINT IF NOT EXISTS
    // So we check existence manually.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'FK_users_company_id'
        ) THEN
          ALTER TABLE "users"
          ADD CONSTRAINT "FK_users_company_id"
          FOREIGN KEY ("company_id") REFERENCES "companies"("id")
          ON DELETE SET NULL
          ON UPDATE CASCADE;
        END IF;
      END$$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP CONSTRAINT IF EXISTS "FK_users_company_id"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_users_company_id"
    `);

    await queryRunner.query(`
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'FK_users_company_id'
    ) THEN
      ALTER TABLE "users"
      ADD CONSTRAINT "FK_users_company_id"
      FOREIGN KEY ("company_id") REFERENCES "companies"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
    END IF;
  END$$;
`);

  }
}