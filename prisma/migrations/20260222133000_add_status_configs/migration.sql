DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_config_entity') THEN
    CREATE TYPE "status_config_entity" AS ENUM ('PROCESS', 'LEAD', 'INVOICE');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "status_configs" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" UUID NOT NULL,
  "entity" "status_config_entity" NOT NULL,
  "code" VARCHAR(60) NOT NULL,
  "label" VARCHAR(120) NOT NULL,
  "color" VARCHAR(20),
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "is_system" BOOLEAN NOT NULL DEFAULT false,
  "legacy_int_value" INTEGER,
  "legacy_lead_status" "lead_status_enum",
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PK_status_configs" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_status_configs_tenant_entity_code"
  ON "status_configs" ("tenant_id", "entity", "code");

CREATE INDEX IF NOT EXISTS "IDX_status_configs_tenant_id"
  ON "status_configs" ("tenant_id");

CREATE INDEX IF NOT EXISTS "IDX_status_configs_tenant_entity_active"
  ON "status_configs" ("tenant_id", "entity", "is_active");
