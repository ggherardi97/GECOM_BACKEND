import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMetadataDesignerModule1770000002500 implements MigrationInterface {
  name = 'CreateMetadataDesignerModule1770000002500';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'metadata_entity_type_enum') THEN
          CREATE TYPE metadata_entity_type_enum AS ENUM ('CUSTOM', 'CORE');
        END IF;
      END$$
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'metadata_field_data_type_enum') THEN
          CREATE TYPE metadata_field_data_type_enum AS ENUM (
            'STRING', 'TEXT', 'INT', 'DECIMAL', 'BOOLEAN', 'DATE', 'DATETIME',
            'UUID', 'JSONB', 'LOOKUP'
          );
        END IF;
      END$$
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'metadata_lookup_on_delete_enum') THEN
          CREATE TYPE metadata_lookup_on_delete_enum AS ENUM ('RESTRICT', 'CASCADE', 'SET_NULL');
        END IF;
      END$$
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'metadata_field_source_enum') THEN
          CREATE TYPE metadata_field_source_enum AS ENUM ('SYSTEM', 'CORE_EXISTING', 'DESIGNER');
        END IF;
      END$$
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'metadata_form_type_enum') THEN
          CREATE TYPE metadata_form_type_enum AS ENUM ('MAIN', 'QUICK_CREATE', 'SIDE_PANEL_CREATE');
        END IF;
      END$$
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'metadata_publish_status_enum') THEN
          CREATE TYPE metadata_publish_status_enum AS ENUM ('SUCCESS', 'FAILED');
        END IF;
      END$$
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'metadata_security_principal_type_enum') THEN
          CREATE TYPE metadata_security_principal_type_enum AS ENUM ('ROLE', 'USER');
        END IF;
      END$$
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'metadata_mask_mode_enum') THEN
          CREATE TYPE metadata_mask_mode_enum AS ENUM ('NONE', 'STARS', 'HIDDEN_TEXT');
        END IF;
      END$$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "metadata_entities" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "name" character varying(120) NOT NULL,
        "display_name" character varying(255) NOT NULL,
        "description" text,
        "entity_type" metadata_entity_type_enum NOT NULL,
        "physical_table_name" character varying(120) NOT NULL,
        "is_schema_editable" boolean NOT NULL DEFAULT false,
        "is_field_editable" boolean NOT NULL DEFAULT false,
        "is_form_editable" boolean NOT NULL DEFAULT true,
        "is_active" boolean NOT NULL DEFAULT true,
        "primary_name_field_id" uuid,
        "draft_version" integer NOT NULL DEFAULT 1,
        "published_version" integer,
        "last_published_at" timestamptz(6),
        "created_at" timestamptz(6) NOT NULL DEFAULT now(),
        "updated_at" timestamptz(6) NOT NULL DEFAULT now(),
        CONSTRAINT "PK_metadata_entities_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "metadata_fields" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "entity_id" uuid NOT NULL,
        "name" character varying(120) NOT NULL,
        "display_name" character varying(255) NOT NULL,
        "data_type" metadata_field_data_type_enum NOT NULL,
        "is_required" boolean NOT NULL DEFAULT false,
        "is_unique" boolean NOT NULL DEFAULT false,
        "default_value" text,
        "format_json" jsonb,
        "lookup_entity_id" uuid,
        "lookup_on_delete" metadata_lookup_on_delete_enum,
        "column_name" character varying(120) NOT NULL,
        "source" metadata_field_source_enum NOT NULL DEFAULT 'DESIGNER',
        "is_system" boolean NOT NULL DEFAULT false,
        "is_active" boolean NOT NULL DEFAULT true,
        "draft_version" integer NOT NULL DEFAULT 1,
        "published_version" integer,
        "created_at" timestamptz(6) NOT NULL DEFAULT now(),
        "updated_at" timestamptz(6) NOT NULL DEFAULT now(),
        CONSTRAINT "PK_metadata_fields_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "metadata_forms" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "entity_id" uuid NOT NULL,
        "name" character varying(120) NOT NULL,
        "display_name" character varying(255) NOT NULL,
        "form_type" metadata_form_type_enum NOT NULL,
        "is_default" boolean NOT NULL DEFAULT false,
        "definition_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "draft_version" integer NOT NULL DEFAULT 1,
        "published_version" integer,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz(6) NOT NULL DEFAULT now(),
        "updated_at" timestamptz(6) NOT NULL DEFAULT now(),
        CONSTRAINT "PK_metadata_forms_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "metadata_entity_publish_log" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "entity_id" uuid NOT NULL,
        "version" integer NOT NULL,
        "published_by_user_id" uuid NOT NULL,
        "published_at" timestamptz(6) NOT NULL DEFAULT now(),
        "migration_name" character varying(255),
        "ddl_preview" text,
        "status" metadata_publish_status_enum NOT NULL,
        "error_message" text,
        "created_at" timestamptz(6) NOT NULL DEFAULT now(),
        "updated_at" timestamptz(6) NOT NULL DEFAULT now(),
        CONSTRAINT "PK_metadata_entity_publish_log_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "metadata_entity_guard" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "entity_name" character varying(120) NOT NULL,
        "block_schema_edit" boolean NOT NULL DEFAULT false,
        "block_field_edit" boolean NOT NULL DEFAULT false,
        "block_form_edit" boolean NOT NULL DEFAULT false,
        "notes" text,
        "created_at" timestamptz(6) NOT NULL DEFAULT now(),
        "updated_at" timestamptz(6) NOT NULL DEFAULT now(),
        CONSTRAINT "PK_metadata_entity_guard_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "metadata_field_security_profiles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "name" character varying(120) NOT NULL,
        "description" text,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz(6) NOT NULL DEFAULT now(),
        "updated_at" timestamptz(6) NOT NULL DEFAULT now(),
        CONSTRAINT "PK_metadata_field_security_profiles_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "metadata_field_security_rules" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "field_id" uuid NOT NULL,
        "profile_id" uuid,
        "principal_type" metadata_security_principal_type_enum NOT NULL,
        "principal_id" uuid NOT NULL,
        "can_view" boolean NOT NULL DEFAULT true,
        "can_read" boolean NOT NULL DEFAULT true,
        "can_edit" boolean NOT NULL DEFAULT false,
        "mask_mode" metadata_mask_mode_enum NOT NULL DEFAULT 'NONE',
        "priority" integer NOT NULL DEFAULT 100,
        "created_at" timestamptz(6) NOT NULL DEFAULT now(),
        "updated_at" timestamptz(6) NOT NULL DEFAULT now(),
        CONSTRAINT "PK_metadata_field_security_rules_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "metadata_field_security_defaults" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "entity_id" uuid,
        "default_can_view" boolean NOT NULL DEFAULT true,
        "default_can_read" boolean NOT NULL DEFAULT true,
        "default_can_edit" boolean NOT NULL DEFAULT false,
        "default_mask_mode" metadata_mask_mode_enum NOT NULL DEFAULT 'HIDDEN_TEXT',
        "created_at" timestamptz(6) NOT NULL DEFAULT now(),
        "updated_at" timestamptz(6) NOT NULL DEFAULT now(),
        CONSTRAINT "PK_metadata_field_security_defaults_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "metadata_fields"
      ADD CONSTRAINT "FK_metadata_fields_entity_id"
      FOREIGN KEY ("entity_id")
      REFERENCES "metadata_entities"("id")
      ON DELETE CASCADE
      ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "metadata_fields"
      ADD CONSTRAINT "FK_metadata_fields_lookup_entity_id"
      FOREIGN KEY ("lookup_entity_id")
      REFERENCES "metadata_entities"("id")
      ON DELETE SET NULL
      ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "metadata_entities"
      ADD CONSTRAINT "FK_metadata_entities_primary_name_field_id"
      FOREIGN KEY ("primary_name_field_id")
      REFERENCES "metadata_fields"("id")
      ON DELETE SET NULL
      ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "metadata_forms"
      ADD CONSTRAINT "FK_metadata_forms_entity_id"
      FOREIGN KEY ("entity_id")
      REFERENCES "metadata_entities"("id")
      ON DELETE CASCADE
      ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "metadata_entity_publish_log"
      ADD CONSTRAINT "FK_metadata_entity_publish_log_entity_id"
      FOREIGN KEY ("entity_id")
      REFERENCES "metadata_entities"("id")
      ON DELETE CASCADE
      ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "metadata_field_security_rules"
      ADD CONSTRAINT "FK_metadata_field_security_rules_field_id"
      FOREIGN KEY ("field_id")
      REFERENCES "metadata_fields"("id")
      ON DELETE CASCADE
      ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "metadata_field_security_rules"
      ADD CONSTRAINT "FK_metadata_field_security_rules_profile_id"
      FOREIGN KEY ("profile_id")
      REFERENCES "metadata_field_security_profiles"("id")
      ON DELETE SET NULL
      ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "metadata_field_security_defaults"
      ADD CONSTRAINT "FK_metadata_field_security_defaults_entity_id"
      FOREIGN KEY ("entity_id")
      REFERENCES "metadata_entities"("id")
      ON DELETE CASCADE
      ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_metadata_entities_tenant_name"
      ON "metadata_entities" ("tenant_id", "name")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_metadata_entities_tenant_id"
      ON "metadata_entities" ("tenant_id")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_metadata_fields_tenant_entity_name"
      ON "metadata_fields" ("tenant_id", "entity_id", "name")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_metadata_fields_tenant_entity_column_name"
      ON "metadata_fields" ("tenant_id", "entity_id", "column_name")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_metadata_fields_tenant_entity"
      ON "metadata_fields" ("tenant_id", "entity_id")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_metadata_forms_tenant_entity_name"
      ON "metadata_forms" ("tenant_id", "entity_id", "name")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_metadata_forms_default_by_type"
      ON "metadata_forms" ("tenant_id", "entity_id", "form_type")
      WHERE "is_default" = true AND "is_active" = true
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_metadata_forms_tenant_entity"
      ON "metadata_forms" ("tenant_id", "entity_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_metadata_entity_publish_log_tenant_entity"
      ON "metadata_entity_publish_log" ("tenant_id", "entity_id")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_metadata_entity_guard_tenant_entity_name"
      ON "metadata_entity_guard" ("tenant_id", "entity_name")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_metadata_entity_guard_tenant_id"
      ON "metadata_entity_guard" ("tenant_id")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_metadata_field_security_profiles_tenant_name"
      ON "metadata_field_security_profiles" ("tenant_id", "name")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_metadata_field_security_rules_tenant_field"
      ON "metadata_field_security_rules" ("tenant_id", "field_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_metadata_field_security_rules_tenant_principal"
      ON "metadata_field_security_rules" ("tenant_id", "principal_type", "principal_id")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_metadata_field_security_defaults_tenant_entity"
      ON "metadata_field_security_defaults" ("tenant_id", "entity_id")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_metadata_field_security_defaults_tenant_global"
      ON "metadata_field_security_defaults" ("tenant_id")
      WHERE "entity_id" IS NULL
    `);

    await queryRunner.query(`
      INSERT INTO "metadata_entity_guard" (
        "tenant_id",
        "entity_name",
        "block_schema_edit",
        "block_field_edit",
        "block_form_edit",
        "notes"
      )
      SELECT
        t.id,
        'documents',
        true,
        true,
        true,
        'Protected R2 documents module: schema/field/form editing blocked.'
      FROM "tenants" t
      ON CONFLICT ("tenant_id", "entity_name")
      DO UPDATE SET
        "block_schema_edit" = EXCLUDED."block_schema_edit",
        "block_field_edit" = EXCLUDED."block_field_edit",
        "block_form_edit" = EXCLUDED."block_form_edit",
        "notes" = EXCLUDED."notes",
        "updated_at" = now()
    `);

    await queryRunner.query(`
      INSERT INTO "metadata_entity_guard" (
        "tenant_id",
        "entity_name",
        "block_schema_edit",
        "block_field_edit",
        "block_form_edit",
        "notes"
      )
      SELECT
        t.id,
        'my_documents',
        true,
        true,
        true,
        'Protected alias for documents module.'
      FROM "tenants" t
      ON CONFLICT ("tenant_id", "entity_name")
      DO UPDATE SET
        "block_schema_edit" = EXCLUDED."block_schema_edit",
        "block_field_edit" = EXCLUDED."block_field_edit",
        "block_form_edit" = EXCLUDED."block_form_edit",
        "notes" = EXCLUDED."notes",
        "updated_at" = now()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "metadata_field_security_defaults"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "metadata_field_security_rules"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "metadata_field_security_profiles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "metadata_entity_guard"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "metadata_entity_publish_log"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "metadata_forms"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "metadata_fields"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "metadata_entities"`);

    await queryRunner.query(`DROP TYPE IF EXISTS metadata_mask_mode_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS metadata_security_principal_type_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS metadata_publish_status_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS metadata_form_type_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS metadata_field_source_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS metadata_lookup_on_delete_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS metadata_field_data_type_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS metadata_entity_type_enum`);
  }
}

