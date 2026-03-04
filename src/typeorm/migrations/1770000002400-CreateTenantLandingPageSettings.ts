import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTenantLandingPageSettings1770000002400 implements MigrationInterface {
  name = 'CreateTenantLandingPageSettings1770000002400';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tenant_landing_page_settings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "landing_page_url" character varying(500),
        "draft_html" text,
        "draft_css" text,
        "draft_project_json" jsonb,
        "published_html" text,
        "published_css" text,
        "published_project_json" jsonb,
        "published_at" timestamptz(6),
        "created_at" timestamptz(6) NOT NULL DEFAULT now(),
        "updated_at" timestamptz(6) NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tenant_landing_page_settings" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_tenant_landing_page_settings_tenant_id" ON "tenant_landing_page_settings" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_tenant_landing_page_settings_tenant_id" ON "tenant_landing_page_settings" ("tenant_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "tenant_landing_page_settings"');
  }
}
