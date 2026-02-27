DO $$
BEGIN
  CREATE TYPE "AutomationExecutionStatus" AS ENUM ('SUCCESS', 'ERROR');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "automations" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" uuid NOT NULL,
  "name" varchar(255) NOT NULL,
  "description" text,
  "entity_name" varchar(100) NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "workflow_json" jsonb NOT NULL,
  "created_by_user_id" uuid NOT NULL,
  "updated_by_user_id" uuid,
  "created_at" timestamp(6) NOT NULL DEFAULT now(),
  "updated_at" timestamp(6) NOT NULL DEFAULT now(),
  CONSTRAINT "PK_automations_id" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "automation_executions" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" uuid NOT NULL,
  "automation_id" uuid NOT NULL,
  "status" "AutomationExecutionStatus" NOT NULL,
  "input_payload" jsonb NOT NULL,
  "output_payload" jsonb,
  "error_message" text,
  "executed_at" timestamp(6) NOT NULL DEFAULT now(),
  CONSTRAINT "PK_automation_executions_id" PRIMARY KEY ("id"),
  CONSTRAINT "fk_automation_executions_automation" FOREIGN KEY ("automation_id") REFERENCES "automations"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_automations_tenant_name"
  ON "automations" ("tenant_id", "name");

CREATE INDEX IF NOT EXISTS "IDX_automations_tenant_id"
  ON "automations" ("tenant_id");

CREATE INDEX IF NOT EXISTS "IDX_automations_tenant_entity_active"
  ON "automations" ("tenant_id", "entity_name", "is_active");

CREATE INDEX IF NOT EXISTS "IDX_automations_tenant_active"
  ON "automations" ("tenant_id", "is_active");

CREATE INDEX IF NOT EXISTS "IDX_automation_executions_tenant_id"
  ON "automation_executions" ("tenant_id");

CREATE INDEX IF NOT EXISTS "IDX_automation_executions_tenant_automation_executed"
  ON "automation_executions" ("tenant_id", "automation_id", "executed_at");

