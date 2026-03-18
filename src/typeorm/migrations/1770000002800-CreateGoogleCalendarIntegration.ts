import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateGoogleCalendarIntegration1770000002800 implements MigrationInterface {
  name = 'CreateGoogleCalendarIntegration1770000002800';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "google_calendar_connections" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "google_email" character varying(255),
        "google_account_sub" character varying(255),
        "access_token_encrypted" text,
        "refresh_token_encrypted" text,
        "token_expires_at" timestamptz(6),
        "scope" text,
        "google_calendar_id" character varying(255),
        "google_calendar_name" character varying(255),
        "sync_direction" character varying(20) NOT NULL DEFAULT 'IMPORT_ONLY',
        "lookback_days" integer NOT NULL DEFAULT 30,
        "auto_sync_enabled" boolean NOT NULL DEFAULT false,
        "auto_sync_interval_minutes" integer,
        "create_meet_link" boolean NOT NULL DEFAULT false,
        "import_guests" boolean NOT NULL DEFAULT false,
        "import_description" boolean NOT NULL DEFAULT true,
        "import_private_events" boolean NOT NULL DEFAULT false,
        "last_sync_at" timestamptz(6),
        "last_sync_token" text,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz(6) NOT NULL DEFAULT now(),
        "updated_at" timestamptz(6) NOT NULL DEFAULT now(),
        CONSTRAINT "PK_google_calendar_connections_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "google_calendar_cached_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "connection_id" uuid NOT NULL,
        "google_calendar_id" character varying(255) NOT NULL,
        "external_event_id" character varying(255) NOT NULL,
        "status" character varying(40),
        "title" character varying(255) NOT NULL,
        "description" text,
        "location" text,
        "start_at" timestamptz(6) NOT NULL,
        "end_at" timestamptz(6),
        "is_all_day" boolean NOT NULL DEFAULT false,
        "html_link" text,
        "organizer_email" character varying(255),
        "etag" character varying(255),
        "raw_json" jsonb,
        "synced_at" timestamptz(6) NOT NULL DEFAULT now(),
        "deleted_at" timestamptz(6),
        "created_at" timestamptz(6) NOT NULL DEFAULT now(),
        "updated_at" timestamptz(6) NOT NULL DEFAULT now(),
        CONSTRAINT "PK_google_calendar_cached_events_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "google_calendar_connections"
      ADD CONSTRAINT "FK_google_calendar_connections_user_id"
      FOREIGN KEY ("user_id")
      REFERENCES "users"("id")
      ON DELETE CASCADE
      ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "google_calendar_cached_events"
      ADD CONSTRAINT "FK_google_calendar_cached_events_user_id"
      FOREIGN KEY ("user_id")
      REFERENCES "users"("id")
      ON DELETE CASCADE
      ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "google_calendar_cached_events"
      ADD CONSTRAINT "FK_google_calendar_cached_events_connection_id"
      FOREIGN KEY ("connection_id")
      REFERENCES "google_calendar_connections"("id")
      ON DELETE CASCADE
      ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_google_calendar_connections_tenant_user"
      ON "google_calendar_connections" ("tenant_id", "user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_google_calendar_connections_tenant_user_active"
      ON "google_calendar_connections" ("tenant_id", "user_id", "is_active")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_google_calendar_cached_events_tenant_connection_external"
      ON "google_calendar_cached_events" ("tenant_id", "connection_id", "external_event_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_google_calendar_cached_events_tenant_user_start"
      ON "google_calendar_cached_events" ("tenant_id", "user_id", "start_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_google_calendar_cached_events_tenant_connection_calendar"
      ON "google_calendar_cached_events" ("tenant_id", "connection_id", "google_calendar_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "google_calendar_cached_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "google_calendar_connections"`);
  }
}
