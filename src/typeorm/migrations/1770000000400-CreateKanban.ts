import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateKanban1770000000400 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'view_visibility_enum') THEN
    CREATE TYPE view_visibility_enum AS ENUM ('PRIVATE', 'SHARED', 'PUBLIC');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'board_entity_type_enum') THEN
    CREATE TYPE board_entity_type_enum AS ENUM ('NONE', 'COMPANY', 'PROCESS', 'INVOICE');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'board_card_priority_enum') THEN
    CREATE TYPE board_card_priority_enum AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'board_card_audit_action_enum') THEN
    CREATE TYPE board_card_audit_action_enum AS ENUM ('CREATED', 'MOVED', 'UPDATED', 'COMMENTED', 'DELETED', 'ASSIGNEES_UPDATED', 'TAGS_UPDATED');
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
CREATE TABLE IF NOT EXISTS boards (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL,
  name varchar(255) NOT NULL,
  description text NULL,
  entity_type board_entity_type_enum NOT NULL DEFAULT 'NONE',
  company_id uuid NULL,
  process_id uuid NULL,
  invoice_id uuid NULL,
  owner_user_id uuid NOT NULL,
  visibility view_visibility_enum NOT NULL DEFAULT 'PRIVATE',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_boards_owner_user
    FOREIGN KEY (owner_user_id) REFERENCES users(id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_boards_company
    FOREIGN KEY (company_id) REFERENCES companies(id)
    ON DELETE SET NULL,
  CONSTRAINT fk_boards_process
    FOREIGN KEY (process_id) REFERENCES processes(id)
    ON DELETE SET NULL,
  CONSTRAINT fk_boards_invoice
    FOREIGN KEY (invoice_id) REFERENCES invoices(id)
    ON DELETE SET NULL
);
`);

    await queryRunner.query(`
CREATE TABLE IF NOT EXISTS board_columns (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL,
  board_id uuid NOT NULL,
  name varchar(150) NOT NULL,
  wip_limit int NULL,
  sort_order int NOT NULL DEFAULT 0,
  color varchar(30) NULL,
  is_done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT uq_board_columns_board_order UNIQUE (board_id, sort_order),
  CONSTRAINT fk_board_columns_board
    FOREIGN KEY (board_id) REFERENCES boards(id)
    ON DELETE CASCADE
);
`);

    await queryRunner.query(`
CREATE TABLE IF NOT EXISTS board_cards (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL,
  board_id uuid NOT NULL,
  column_id uuid NOT NULL,
  title varchar(255) NOT NULL,
  description text NULL,
  priority board_card_priority_enum NOT NULL DEFAULT 'MEDIUM',
  due_date timestamptz NULL,
  start_date timestamptz NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_by_user_id uuid NOT NULL,
  assigned_to_user_id uuid NULL,
  company_id uuid NULL,
  process_id uuid NULL,
  invoice_id uuid NULL,
  related_table varchar(50) NULL,
  related_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at timestamptz NULL,

  CONSTRAINT fk_board_cards_board
    FOREIGN KEY (board_id) REFERENCES boards(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_board_cards_column
    FOREIGN KEY (column_id) REFERENCES board_columns(id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_board_cards_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users(id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_board_cards_assigned_to
    FOREIGN KEY (assigned_to_user_id) REFERENCES users(id)
    ON DELETE SET NULL,
  CONSTRAINT fk_board_cards_company
    FOREIGN KEY (company_id) REFERENCES companies(id)
    ON DELETE SET NULL,
  CONSTRAINT fk_board_cards_process
    FOREIGN KEY (process_id) REFERENCES processes(id)
    ON DELETE SET NULL,
  CONSTRAINT fk_board_cards_invoice
    FOREIGN KEY (invoice_id) REFERENCES invoices(id)
    ON DELETE SET NULL
);
`);

    await queryRunner.query(`
CREATE TABLE IF NOT EXISTS board_tags (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL,
  name varchar(100) NOT NULL,
  color varchar(30) NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT uq_board_tags_tenant_name UNIQUE (tenant_id, name)
);
`);

    await queryRunner.query(`
CREATE TABLE IF NOT EXISTS board_card_tags (
  tenant_id uuid NOT NULL,
  card_id uuid NOT NULL,
  tag_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT pk_board_card_tags PRIMARY KEY (tenant_id, card_id, tag_id),
  CONSTRAINT fk_board_card_tags_card
    FOREIGN KEY (card_id) REFERENCES board_cards(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_board_card_tags_tag
    FOREIGN KEY (tag_id) REFERENCES board_tags(id)
    ON DELETE CASCADE
);
`);

    await queryRunner.query(`
CREATE TABLE IF NOT EXISTS board_card_comments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL,
  card_id uuid NOT NULL,
  user_id uuid NOT NULL,
  comment text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_board_card_comments_card
    FOREIGN KEY (card_id) REFERENCES board_cards(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_board_card_comments_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE RESTRICT
);
`);

    await queryRunner.query(`
CREATE TABLE IF NOT EXISTS board_card_audit (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL,
  card_id uuid NOT NULL,
  action board_card_audit_action_enum NOT NULL,
  from_column_id uuid NULL,
  to_column_id uuid NULL,
  meta_json jsonb NULL,
  created_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_board_card_audit_card
    FOREIGN KEY (card_id) REFERENCES board_cards(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_board_card_audit_from_column
    FOREIGN KEY (from_column_id) REFERENCES board_columns(id)
    ON DELETE SET NULL,
  CONSTRAINT fk_board_card_audit_to_column
    FOREIGN KEY (to_column_id) REFERENCES board_columns(id)
    ON DELETE SET NULL,
  CONSTRAINT fk_board_card_audit_user
    FOREIGN KEY (created_by_user_id) REFERENCES users(id)
    ON DELETE RESTRICT
);
`);

    await queryRunner.query(`
CREATE TABLE IF NOT EXISTS board_card_assignees (
  tenant_id uuid NOT NULL,
  card_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT pk_board_card_assignees PRIMARY KEY (tenant_id, card_id, user_id),
  CONSTRAINT fk_board_card_assignees_card
    FOREIGN KEY (card_id) REFERENCES board_cards(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_board_card_assignees_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
);
`);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_boards_tenant_id" ON "boards" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_boards_owner_user" ON "boards" ("owner_user_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_boards_tenant_active" ON "boards" ("tenant_id", "is_active")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_boards_tenant_context" ON "boards" ("tenant_id", "entity_type", "company_id", "process_id", "invoice_id")`);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_board_columns_tenant_id" ON "board_columns" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_board_columns_board_id" ON "board_columns" ("board_id")`);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_board_cards_tenant_board_column_order" ON "board_cards" ("tenant_id", "board_id", "column_id", "sort_order")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_board_cards_assigned_to" ON "board_cards" ("tenant_id", "assigned_to_user_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_board_cards_due_date" ON "board_cards" ("tenant_id", "due_date")`);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_board_tags_tenant_name" ON "board_tags" ("tenant_id", "name")`);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_board_card_tags_card" ON "board_card_tags" ("card_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_board_card_tags_tag" ON "board_card_tags" ("tag_id")`);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_board_card_comments_tenant_card_created" ON "board_card_comments" ("tenant_id", "card_id", "created_at")`);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_board_card_audit_tenant_card_created" ON "board_card_audit" ("tenant_id", "card_id", "created_at")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_board_card_audit_action" ON "board_card_audit" ("tenant_id", "action")`);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_board_card_assignees_tenant_user" ON "board_card_assignees" ("tenant_id", "user_id")`);

    await queryRunner.query(`
DROP TRIGGER IF EXISTS trg_boards_updated_at ON boards;
CREATE TRIGGER trg_boards_updated_at
BEFORE UPDATE ON boards
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
`);

    await queryRunner.query(`
DROP TRIGGER IF EXISTS trg_board_columns_updated_at ON board_columns;
CREATE TRIGGER trg_board_columns_updated_at
BEFORE UPDATE ON board_columns
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
`);

    await queryRunner.query(`
DROP TRIGGER IF EXISTS trg_board_cards_updated_at ON board_cards;
CREATE TRIGGER trg_board_cards_updated_at
BEFORE UPDATE ON board_cards
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_board_cards_updated_at ON board_cards`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_board_columns_updated_at ON board_columns`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_boards_updated_at ON boards`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_board_card_assignees_tenant_user"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_board_card_audit_action"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_board_card_audit_tenant_card_created"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_board_card_comments_tenant_card_created"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_board_card_tags_tag"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_board_card_tags_card"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_board_tags_tenant_name"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_board_cards_due_date"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_board_cards_assigned_to"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_board_cards_tenant_board_column_order"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_board_columns_board_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_board_columns_tenant_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_boards_tenant_context"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_boards_tenant_active"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_boards_owner_user"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_boards_tenant_id"`);

    await queryRunner.query(`DROP TABLE IF EXISTS board_card_assignees`);
    await queryRunner.query(`DROP TABLE IF EXISTS board_card_audit`);
    await queryRunner.query(`DROP TABLE IF EXISTS board_card_comments`);
    await queryRunner.query(`DROP TABLE IF EXISTS board_card_tags`);
    await queryRunner.query(`DROP TABLE IF EXISTS board_tags`);
    await queryRunner.query(`DROP TABLE IF EXISTS board_cards`);
    await queryRunner.query(`DROP TABLE IF EXISTS board_columns`);
    await queryRunner.query(`DROP TABLE IF EXISTS boards`);

    await queryRunner.query(`DROP TYPE IF EXISTS board_card_audit_action_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS board_card_priority_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS board_entity_type_enum`);
  }
}
