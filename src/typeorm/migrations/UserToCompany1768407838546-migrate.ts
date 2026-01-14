import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCompanyIdToUsers1761419999999 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) Add nullable column first (safe for existing data)
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "company_id" uuid NULL
    `);

    // 2) Index (performance for joins / filtering)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_users_company_id"
      ON "users" ("company_id")
    `);

    // 3) Foreign key to companies
    //    - ON DELETE SET NULL: if company is deleted, users are detached (safer)
    //    - ON UPDATE CASCADE: keeps integrity if company id changes (rare)
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD CONSTRAINT IF NOT EXISTS "FK_users_company_id"
      FOREIGN KEY ("company_id") REFERENCES "companies"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE
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
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "company_id"
    `);
  }
}
