ALTER TABLE "po_milestones"
  ADD COLUMN "project_id" uuid NULL;

ALTER TABLE "po_deliverables"
  ADD COLUMN "project_id" uuid NULL;

ALTER TABLE "po_checklists"
  ADD COLUMN "project_id" uuid NULL;

UPDATE "po_milestones" AS m
SET "project_id" = pp."project_id"
FROM (
  SELECT DISTINCT ON ("tenant_id", "process_id")
    "tenant_id",
    "process_id",
    "project_id"
  FROM "po_project_processes"
  ORDER BY "tenant_id", "process_id", "sort_order" ASC, "created_at" ASC
) AS pp
WHERE m."tenant_id" = pp."tenant_id"
  AND m."process_id" = pp."process_id"
  AND m."project_id" IS NULL;

UPDATE "po_deliverables" AS d
SET "project_id" = pp."project_id"
FROM (
  SELECT DISTINCT ON ("tenant_id", "process_id")
    "tenant_id",
    "process_id",
    "project_id"
  FROM "po_project_processes"
  ORDER BY "tenant_id", "process_id", "sort_order" ASC, "created_at" ASC
) AS pp
WHERE d."tenant_id" = pp."tenant_id"
  AND d."process_id" = pp."process_id"
  AND d."project_id" IS NULL;

UPDATE "po_checklists" AS c
SET "project_id" = pp."project_id"
FROM (
  SELECT DISTINCT ON ("tenant_id", "process_id")
    "tenant_id",
    "process_id",
    "project_id"
  FROM "po_project_processes"
  ORDER BY "tenant_id", "process_id", "sort_order" ASC, "created_at" ASC
) AS pp
WHERE c."tenant_id" = pp."tenant_id"
  AND c."process_id" = pp."process_id"
  AND c."project_id" IS NULL;

ALTER TABLE "po_milestones"
  DROP CONSTRAINT IF EXISTS "fk_po_milestones_process";
ALTER TABLE "po_deliverables"
  DROP CONSTRAINT IF EXISTS "fk_po_deliverables_process";
ALTER TABLE "po_checklists"
  DROP CONSTRAINT IF EXISTS "fk_po_checklists_process";

ALTER TABLE "po_milestones"
  ALTER COLUMN "process_id" DROP NOT NULL;
ALTER TABLE "po_deliverables"
  ALTER COLUMN "process_id" DROP NOT NULL;
ALTER TABLE "po_checklists"
  ALTER COLUMN "process_id" DROP NOT NULL;

ALTER TABLE "po_milestones"
  ADD CONSTRAINT "fk_po_milestones_process"
    FOREIGN KEY ("process_id") REFERENCES "processes"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "po_deliverables"
  ADD CONSTRAINT "fk_po_deliverables_process"
    FOREIGN KEY ("process_id") REFERENCES "processes"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "po_checklists"
  ADD CONSTRAINT "fk_po_checklists_process"
    FOREIGN KEY ("process_id") REFERENCES "processes"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "po_milestones"
  ADD CONSTRAINT "fk_po_milestones_project"
    FOREIGN KEY ("project_id") REFERENCES "po_projects"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "po_deliverables"
  ADD CONSTRAINT "fk_po_deliverables_project"
    FOREIGN KEY ("project_id") REFERENCES "po_projects"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "po_checklists"
  ADD CONSTRAINT "fk_po_checklists_project"
    FOREIGN KEY ("project_id") REFERENCES "po_projects"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;

CREATE INDEX IF NOT EXISTS "IDX_po_milestones_tenant_project"
  ON "po_milestones"("tenant_id", "project_id");

CREATE INDEX IF NOT EXISTS "IDX_po_deliverables_tenant_project"
  ON "po_deliverables"("tenant_id", "project_id");

CREATE INDEX IF NOT EXISTS "IDX_po_checklists_tenant_project"
  ON "po_checklists"("tenant_id", "project_id");
