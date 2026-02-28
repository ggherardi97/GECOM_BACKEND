import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAdminConfigModule1770000002100 implements MigrationInterface {
  name = 'CreateAdminConfigModule1770000002100';

  private async ensureConstraint(queryRunner: QueryRunner, constraintName: string, sql: string): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = '${constraintName}'
        ) THEN
          ${sql}
        END IF;
      END $$;
    `);
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tenant_menu_config" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "config_json" jsonb NOT NULL,
        "created_at" timestamptz(6) NOT NULL DEFAULT now(),
        "updated_at" timestamptz(6) NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tenant_menu_config" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_tenant_menu_config_tenant_id" ON "tenant_menu_config" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_tenant_menu_config_tenant_id" ON "tenant_menu_config" ("tenant_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tenant_theme_settings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "primary_color" character varying(20),
        "nav_bg_color" character varying(20),
        "nav_text_color" character varying(20),
        "topbar_bg_color" character varying(20),
        "layout_mode" character varying(20),
        "logo_url" character varying(500),
        "favicon_url" character varying(500),
        "created_at" timestamptz(6) NOT NULL DEFAULT now(),
        "updated_at" timestamptz(6) NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tenant_theme_settings" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_tenant_theme_settings_tenant_id" ON "tenant_theme_settings" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_tenant_theme_settings_tenant_id" ON "tenant_theme_settings" ("tenant_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "option_sets" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "entity" character varying(80) NOT NULL,
        "field" character varying(80) NOT NULL,
        "created_at" timestamptz(6) NOT NULL DEFAULT now(),
        "updated_at" timestamptz(6) NOT NULL DEFAULT now(),
        CONSTRAINT "PK_option_sets" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_option_sets_tenant_entity_field" ON "option_sets" ("tenant_id", "entity", "field")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_option_sets_tenant_id" ON "option_sets" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_option_sets_tenant_entity" ON "option_sets" ("tenant_id", "entity")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "option_set_options" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "option_set_id" uuid NOT NULL,
        "value" character varying(60) NOT NULL,
        "label" character varying(160) NOT NULL,
        "color" character varying(20),
        "sort_order" integer NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz(6) NOT NULL DEFAULT now(),
        "updated_at" timestamptz(6) NOT NULL DEFAULT now(),
        CONSTRAINT "PK_option_set_options" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_option_set_options_set_value" ON "option_set_options" ("option_set_id", "value")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_option_set_options_option_set_id" ON "option_set_options" ("option_set_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_option_set_options_option_set_active" ON "option_set_options" ("option_set_id", "is_active")`,
    );

    await this.ensureConstraint(
      queryRunner,
      'fk_option_set_options_option_set',
      'ALTER TABLE "option_set_options" ADD CONSTRAINT "fk_option_set_options_option_set" FOREIGN KEY ("option_set_id") REFERENCES "option_sets"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "email_integrations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "provider" character varying(20) NOT NULL,
        "display_name" character varying(120) NOT NULL,
        "sender_email" character varying(160) NOT NULL,
        "client_id" character varying(255),
        "client_secret" character varying(255),
        "tenant_domain" character varying(255),
        "smtp_host" character varying(255),
        "smtp_port" integer,
        "smtp_user" character varying(255),
        "smtp_password" character varying(255),
        "is_active" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz(6) NOT NULL DEFAULT now(),
        "updated_at" timestamptz(6) NOT NULL DEFAULT now(),
        CONSTRAINT "PK_email_integrations" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_email_integrations_tenant_id" ON "email_integrations" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_email_integrations_tenant_active" ON "email_integrations" ("tenant_id", "is_active")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "admin_audit_log" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "action" character varying(120) NOT NULL,
        "entity" character varying(120) NOT NULL,
        "before_json" jsonb,
        "after_json" jsonb,
        "created_at" timestamptz(6) NOT NULL DEFAULT now(),
        CONSTRAINT "PK_admin_audit_log" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_admin_audit_log_tenant_id" ON "admin_audit_log" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_admin_audit_log_tenant_created" ON "admin_audit_log" ("tenant_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_admin_audit_log_tenant_entity" ON "admin_audit_log" ("tenant_id", "entity")`,
    );

    await this.ensureConstraint(
      queryRunner,
      'fk_admin_audit_log_user',
      'ALTER TABLE "admin_audit_log" ADD CONSTRAINT "fk_admin_audit_log_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "admin_audit_log"');
    await queryRunner.query('DROP TABLE IF EXISTS "email_integrations"');
    await queryRunner.query('DROP TABLE IF EXISTS "option_set_options"');
    await queryRunner.query('DROP TABLE IF EXISTS "option_sets"');
    await queryRunner.query('DROP TABLE IF EXISTS "tenant_theme_settings"');
    await queryRunner.query('DROP TABLE IF EXISTS "tenant_menu_config"');
  }
}
