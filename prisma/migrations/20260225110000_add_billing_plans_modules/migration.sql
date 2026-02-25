DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'TenantSubscriptionStatus'
  ) THEN
    CREATE TYPE "TenantSubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELED');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "modules" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "code" VARCHAR(80) NOT NULL,
  "name_pt_br" VARCHAR(255) NOT NULL,
  "description_pt_br" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PK_modules_id" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "plans" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "code" VARCHAR(80) NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "description" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PK_plans_id" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "plan_modules" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "plan_id" UUID NOT NULL,
  "module_id" UUID NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "included" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PK_plan_modules_id" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "tenant_subscriptions" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" UUID NOT NULL,
  "plan_id" UUID NOT NULL,
  "status" "TenantSubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
  "starts_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ends_at" TIMESTAMPTZ(6),
  "renews_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PK_tenant_subscriptions_id" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "tenant_module_overrides" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" UUID NOT NULL,
  "module_id" UUID NOT NULL,
  "enabled" BOOLEAN NOT NULL,
  "reason" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PK_tenant_module_overrides_id" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_plan_modules_plan_id') THEN
    ALTER TABLE "plan_modules"
      ADD CONSTRAINT "FK_plan_modules_plan_id"
      FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_plan_modules_module_id') THEN
    ALTER TABLE "plan_modules"
      ADD CONSTRAINT "FK_plan_modules_module_id"
      FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_tenant_subscriptions_tenant_id') THEN
    ALTER TABLE "tenant_subscriptions"
      ADD CONSTRAINT "FK_tenant_subscriptions_tenant_id"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_tenant_subscriptions_plan_id') THEN
    ALTER TABLE "tenant_subscriptions"
      ADD CONSTRAINT "FK_tenant_subscriptions_plan_id"
      FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_tenant_module_overrides_tenant_id') THEN
    ALTER TABLE "tenant_module_overrides"
      ADD CONSTRAINT "FK_tenant_module_overrides_tenant_id"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_tenant_module_overrides_module_id') THEN
    ALTER TABLE "tenant_module_overrides"
      ADD CONSTRAINT "FK_tenant_module_overrides_module_id"
      FOREIGN KEY ("module_id") REFERENCES "modules"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_modules_code" ON "modules" ("code");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_plans_code" ON "plans" ("code");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_plan_modules_plan_module" ON "plan_modules" ("plan_id", "module_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_tenant_module_overrides_tenant_module" ON "tenant_module_overrides" ("tenant_id", "module_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_tenant_subscriptions_active_trial"
  ON "tenant_subscriptions" ("tenant_id")
  WHERE "status" IN ('ACTIVE', 'TRIAL');

CREATE INDEX IF NOT EXISTS "IDX_modules_is_active" ON "modules" ("is_active");
CREATE INDEX IF NOT EXISTS "IDX_plans_is_active" ON "plans" ("is_active");
CREATE INDEX IF NOT EXISTS "IDX_plan_modules_plan_id" ON "plan_modules" ("plan_id");
CREATE INDEX IF NOT EXISTS "IDX_plan_modules_module_id" ON "plan_modules" ("module_id");
CREATE INDEX IF NOT EXISTS "IDX_tenant_subscriptions_tenant_id" ON "tenant_subscriptions" ("tenant_id");
CREATE INDEX IF NOT EXISTS "IDX_tenant_subscriptions_plan_id" ON "tenant_subscriptions" ("plan_id");
CREATE INDEX IF NOT EXISTS "IDX_tenant_module_overrides_tenant_id" ON "tenant_module_overrides" ("tenant_id");
CREATE INDEX IF NOT EXISTS "IDX_tenant_module_overrides_module_id" ON "tenant_module_overrides" ("module_id");
