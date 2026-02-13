import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLeads1770000000500 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_type_enum') THEN
    CREATE TYPE lead_type_enum AS ENUM ('COMPANY', 'PERSON');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_source_enum') THEN
    CREATE TYPE lead_source_enum AS ENUM ('MANUAL', 'WEBSITE', 'INDICATION', 'IMPORT', 'OTHER');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_status_enum') THEN
    CREATE TYPE lead_status_enum AS ENUM ('NEW', 'WORKING', 'QUALIFIED', 'DISQUALIFIED', 'CONVERTED');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_activity_type_enum') THEN
    CREATE TYPE lead_activity_type_enum AS ENUM ('NOTE', 'CALL', 'EMAIL', 'MEETING', 'WHATSAPP', 'TASK');
  END IF;
END$$;
`);

    await queryRunner.query(`
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
`);

    await queryRunner.query(`
CREATE TABLE IF NOT EXISTS lead_pipeline_stages (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL,
  name varchar(150) NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_won boolean NOT NULL DEFAULT false,
  is_lost boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT uq_lead_pipeline_stages_tenant_name UNIQUE (tenant_id, name),
  CONSTRAINT uq_lead_pipeline_stages_tenant_order UNIQUE (tenant_id, sort_order)
);
`);

    await queryRunner.query(`
CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL,
  name varchar(255) NOT NULL,
  type lead_type_enum NOT NULL,

  company_name varchar(255) NULL,
  first_name varchar(150) NULL,
  last_name varchar(150) NULL,
  email varchar(255) NULL,
  phone varchar(50) NULL,
  website varchar(255) NULL,

  source lead_source_enum NOT NULL DEFAULT 'MANUAL',
  owner_user_id uuid NOT NULL,

  status lead_status_enum NOT NULL DEFAULT 'NEW',
  stage_id uuid NULL,
  disqualify_reason text NULL,

  converted_company_id uuid NULL,
  converted_contact_id uuid NULL,
  converted_at timestamptz NULL,

  estimated_value numeric(19,4) NULL,
  currency_code varchar(3) NULL,
  notes text NULL,

  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_leads_owner_user
    FOREIGN KEY (owner_user_id) REFERENCES users(id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_leads_stage
    FOREIGN KEY (stage_id) REFERENCES lead_pipeline_stages(id)
    ON DELETE SET NULL,
  CONSTRAINT fk_leads_converted_company
    FOREIGN KEY (converted_company_id) REFERENCES companies(id)
    ON DELETE SET NULL
);
`);

    await queryRunner.query(`
CREATE TABLE IF NOT EXISTS lead_stage_history (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  from_stage_id uuid NULL,
  to_stage_id uuid NOT NULL,
  changed_by_user_id uuid NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  note text NULL,

  CONSTRAINT fk_lead_stage_history_lead
    FOREIGN KEY (lead_id) REFERENCES leads(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_lead_stage_history_from_stage
    FOREIGN KEY (from_stage_id) REFERENCES lead_pipeline_stages(id)
    ON DELETE SET NULL,
  CONSTRAINT fk_lead_stage_history_to_stage
    FOREIGN KEY (to_stage_id) REFERENCES lead_pipeline_stages(id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_lead_stage_history_user
    FOREIGN KEY (changed_by_user_id) REFERENCES users(id)
    ON DELETE RESTRICT
);
`);

    await queryRunner.query(`
CREATE TABLE IF NOT EXISTS lead_activities (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  type lead_activity_type_enum NOT NULL,
  subject varchar(255) NOT NULL,
  description text NULL,
  due_date timestamptz NULL,
  completed_at timestamptz NULL,
  created_by_user_id uuid NOT NULL,
  assigned_to_user_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_lead_activities_lead
    FOREIGN KEY (lead_id) REFERENCES leads(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_lead_activities_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users(id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_lead_activities_assigned_to
    FOREIGN KEY (assigned_to_user_id) REFERENCES users(id)
    ON DELETE SET NULL
);
`);

    await queryRunner.query(`
CREATE TABLE IF NOT EXISTS lead_tags (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL,
  name varchar(100) NOT NULL,
  color varchar(30) NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT uq_lead_tags_tenant_name UNIQUE (tenant_id, name)
);
`);

    await queryRunner.query(`
CREATE TABLE IF NOT EXISTS lead_tag_links (
  tenant_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  tag_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT pk_lead_tag_links PRIMARY KEY (tenant_id, lead_id, tag_id),
  CONSTRAINT fk_lead_tag_links_lead
    FOREIGN KEY (lead_id) REFERENCES leads(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_lead_tag_links_tag
    FOREIGN KEY (tag_id) REFERENCES lead_tags(id)
    ON DELETE CASCADE
);
`);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_leads_tenant_status" ON "leads" ("tenant_id", "status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_leads_tenant_owner" ON "leads" ("tenant_id", "owner_user_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_leads_tenant_stage" ON "leads" ("tenant_id", "stage_id")`);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_lead_pipeline_stages_tenant_order" ON "lead_pipeline_stages" ("tenant_id", "sort_order")`);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_lead_stage_history_tenant_lead_changed" ON "lead_stage_history" ("tenant_id", "lead_id", "changed_at" DESC)`);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_lead_activities_tenant_lead_due" ON "lead_activities" ("tenant_id", "lead_id", "due_date")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_lead_activities_tenant_assigned" ON "lead_activities" ("tenant_id", "assigned_to_user_id")`);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_lead_tags_tenant_name" ON "lead_tags" ("tenant_id", "name")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_lead_tag_links_lead" ON "lead_tag_links" ("lead_id")`);

    await queryRunner.query(`
DROP TRIGGER IF EXISTS trg_lead_pipeline_stages_updated_at ON lead_pipeline_stages;
CREATE TRIGGER trg_lead_pipeline_stages_updated_at
BEFORE UPDATE ON lead_pipeline_stages
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
`);

    await queryRunner.query(`
DROP TRIGGER IF EXISTS trg_leads_updated_at ON leads;
CREATE TRIGGER trg_leads_updated_at
BEFORE UPDATE ON leads
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
`);

    await queryRunner.query(`
DROP TRIGGER IF EXISTS trg_lead_activities_updated_at ON lead_activities;
CREATE TRIGGER trg_lead_activities_updated_at
BEFORE UPDATE ON lead_activities
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_lead_activities_updated_at ON lead_activities`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_leads_updated_at ON leads`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_lead_pipeline_stages_updated_at ON lead_pipeline_stages`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_lead_tag_links_lead"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_lead_tags_tenant_name"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_lead_activities_tenant_assigned"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_lead_activities_tenant_lead_due"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_lead_stage_history_tenant_lead_changed"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_lead_pipeline_stages_tenant_order"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_leads_tenant_stage"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_leads_tenant_owner"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_leads_tenant_status"`);

    await queryRunner.query(`DROP TABLE IF EXISTS lead_tag_links`);
    await queryRunner.query(`DROP TABLE IF EXISTS lead_tags`);
    await queryRunner.query(`DROP TABLE IF EXISTS lead_activities`);
    await queryRunner.query(`DROP TABLE IF EXISTS lead_stage_history`);
    await queryRunner.query(`DROP TABLE IF EXISTS leads`);
    await queryRunner.query(`DROP TABLE IF EXISTS lead_pipeline_stages`);

    await queryRunner.query(`DROP TYPE IF EXISTS lead_activity_type_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS lead_status_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS lead_source_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS lead_type_enum`);
  }
}
