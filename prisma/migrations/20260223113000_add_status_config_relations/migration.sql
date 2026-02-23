ALTER TABLE "processes"
  ADD COLUMN IF NOT EXISTS "status_config_id" UUID;

ALTER TABLE "invoices"
  ADD COLUMN IF NOT EXISTS "status_config_id" UUID;

ALTER TABLE "leads"
  ADD COLUMN IF NOT EXISTS "status_config_id" UUID;

UPDATE "processes" p
SET "status_config_id" = sc."id"
FROM "status_configs" sc
WHERE p."status_config_id" IS NULL
  AND p."tenant_id" IS NOT NULL
  AND sc."tenant_id" = p."tenant_id"
  AND sc."entity" = 'PROCESS'
  AND sc."legacy_int_value" = p."status"
  AND sc."is_active" = true;

UPDATE "invoices" i
SET "status_config_id" = sc."id"
FROM "status_configs" sc
WHERE i."status_config_id" IS NULL
  AND i."tenant_id" IS NOT NULL
  AND sc."tenant_id" = i."tenant_id"
  AND sc."entity" = 'INVOICE'
  AND sc."legacy_int_value" = i."status"
  AND sc."is_active" = true;

UPDATE "leads" l
SET "status_config_id" = sc."id"
FROM "status_configs" sc
WHERE l."status_config_id" IS NULL
  AND l."tenant_id" IS NOT NULL
  AND sc."tenant_id" = l."tenant_id"
  AND sc."entity" = 'LEAD'
  AND sc."legacy_lead_status" = l."status"
  AND sc."is_active" = true;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_processes_status_config') THEN
    ALTER TABLE "processes"
      ADD CONSTRAINT "FK_processes_status_config"
      FOREIGN KEY ("status_config_id") REFERENCES "status_configs"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_invoices_status_config') THEN
    ALTER TABLE "invoices"
      ADD CONSTRAINT "FK_invoices_status_config"
      FOREIGN KEY ("status_config_id") REFERENCES "status_configs"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_leads_status_config') THEN
    ALTER TABLE "leads"
      ADD CONSTRAINT "FK_leads_status_config"
      FOREIGN KEY ("status_config_id") REFERENCES "status_configs"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "IDX_processes_tenant_status_config"
  ON "processes" ("tenant_id", "status_config_id");

CREATE INDEX IF NOT EXISTS "IDX_invoices_tenant_status_config"
  ON "invoices" ("tenant_id", "status_config_id");

CREATE INDEX IF NOT EXISTS "IDX_leads_tenant_status_config"
  ON "leads" ("tenant_id", "status_config_id");
