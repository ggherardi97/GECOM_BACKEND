import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProjectOperationsModule1770000002000 implements MigrationInterface {
  name = 'CreateProjectOperationsModule1770000002000';

  private sqlLiteral(value: string): string {
    return String(value).replace(/'/g, "''");
  }

  private sqlIdentifier(value: string): string {
    return String(value).replace(/"/g, '""');
  }

  private async enumExists(queryRunner: QueryRunner, enumName: string): Promise<boolean> {
    const result = await queryRunner.query(
      `
      SELECT 1
      FROM pg_type
      WHERE typname = $1
      LIMIT 1
      `,
      [enumName],
    );
    return result.length > 0;
  }

  private async ensureEnum(queryRunner: QueryRunner, enumName: string, values: string[]): Promise<void> {
    if (!(await this.enumExists(queryRunner, enumName))) {
      const enumValues = values.map((value) => `'${value.replace(/'/g, "''")}'`).join(', ');
      await queryRunner.query(`CREATE TYPE "${enumName}" AS ENUM (${enumValues})`);
      return;
    }

    for (const value of values) {
      const enumNameLiteral = this.sqlLiteral(enumName);
      const enumValueLiteral = this.sqlLiteral(value);
      const enumNameIdentifier = this.sqlIdentifier(enumName);
      await queryRunner.query(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1
            FROM pg_type t
            WHERE t.typname = '${enumNameLiteral}'
          ) AND NOT EXISTS (
            SELECT 1
            FROM pg_type t
            JOIN pg_enum e ON e.enumtypid = t.oid
            WHERE t.typname = '${enumNameLiteral}'
              AND e.enumlabel = '${enumValueLiteral}'
          ) THEN
            EXECUTE 'ALTER TYPE "${enumNameIdentifier}" ADD VALUE ''${enumValueLiteral}''';
          END IF;
        END $$;
      `);
    }
  }

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
    await this.ensureEnum(queryRunner, 'PoMilestoneStatus', ['PLANNED', 'DONE', 'CANCELED']);
    await this.ensureEnum(queryRunner, 'PoChecklistItemStatus', ['OPEN', 'DONE', 'BLOCKED']);
    await this.ensureEnum(queryRunner, 'PoWorkOrderPriority', ['LOW', 'MEDIUM', 'HIGH']);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "po_project_statuses" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "name" character varying(120) NOT NULL,
        "code" character varying(40) NOT NULL,
        "color" character varying(20),
        "sort_order" integer NOT NULL DEFAULT 0,
        "is_default" boolean NOT NULL DEFAULT false,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamp(6) NOT NULL DEFAULT now(),
        "updated_at" timestamp(6) NOT NULL DEFAULT now(),
        "deleted_at" timestamp(6),
        CONSTRAINT "PK_po_project_statuses" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "uq_po_project_statuses_tenant_code" ON "po_project_statuses" ("tenant_id", "code")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_po_project_statuses_tenant_id" ON "po_project_statuses" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_po_project_statuses_tenant_active" ON "po_project_statuses" ("tenant_id", "is_active")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "po_deliverable_statuses" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "name" character varying(120) NOT NULL,
        "code" character varying(40) NOT NULL,
        "color" character varying(20),
        "sort_order" integer NOT NULL DEFAULT 0,
        "is_default" boolean NOT NULL DEFAULT false,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamp(6) NOT NULL DEFAULT now(),
        "updated_at" timestamp(6) NOT NULL DEFAULT now(),
        "deleted_at" timestamp(6),
        CONSTRAINT "PK_po_deliverable_statuses" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "uq_po_deliverable_statuses_tenant_code" ON "po_deliverable_statuses" ("tenant_id", "code")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_po_deliverable_statuses_tenant_id" ON "po_deliverable_statuses" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_po_deliverable_statuses_tenant_active" ON "po_deliverable_statuses" ("tenant_id", "is_active")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "po_work_order_statuses" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "name" character varying(120) NOT NULL,
        "code" character varying(40) NOT NULL,
        "color" character varying(20),
        "sort_order" integer NOT NULL DEFAULT 0,
        "is_default" boolean NOT NULL DEFAULT false,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamp(6) NOT NULL DEFAULT now(),
        "updated_at" timestamp(6) NOT NULL DEFAULT now(),
        "deleted_at" timestamp(6),
        CONSTRAINT "PK_po_work_order_statuses" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "uq_po_work_order_statuses_tenant_code" ON "po_work_order_statuses" ("tenant_id", "code")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_po_work_order_statuses_tenant_id" ON "po_work_order_statuses" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_po_work_order_statuses_tenant_active" ON "po_work_order_statuses" ("tenant_id", "is_active")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "po_resource_roles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "name" character varying(120) NOT NULL,
        "code" character varying(40),
        "description" text,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamp(6) NOT NULL DEFAULT now(),
        "updated_at" timestamp(6) NOT NULL DEFAULT now(),
        "deleted_at" timestamp(6),
        CONSTRAINT "PK_po_resource_roles" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "uq_po_resource_roles_tenant_name" ON "po_resource_roles" ("tenant_id", "name")`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "uq_po_resource_roles_tenant_code" ON "po_resource_roles" ("tenant_id", "code") WHERE "code" IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_po_resource_roles_tenant_id" ON "po_resource_roles" ("tenant_id")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "po_projects" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "code" character varying(40),
        "name" character varying(160) NOT NULL,
        "description" text,
        "status_id" uuid,
        "start_date" date,
        "target_end_date" date,
        "actual_end_date" date,
        "owner_user_id" uuid NOT NULL,
        "company_id" uuid,
        "created_at" timestamp(6) NOT NULL DEFAULT now(),
        "updated_at" timestamp(6) NOT NULL DEFAULT now(),
        "deleted_at" timestamp(6),
        CONSTRAINT "PK_po_projects" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "uq_po_projects_tenant_code" ON "po_projects" ("tenant_id", "code") WHERE "code" IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_po_projects_tenant_id" ON "po_projects" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_po_projects_tenant_status" ON "po_projects" ("tenant_id", "status_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_po_projects_tenant_company" ON "po_projects" ("tenant_id", "company_id")`);

    await this.ensureConstraint(
      queryRunner,
      'fk_po_projects_status',
      'ALTER TABLE "po_projects" ADD CONSTRAINT "fk_po_projects_status" FOREIGN KEY ("status_id") REFERENCES "po_project_statuses"("id") ON DELETE SET NULL ON UPDATE NO ACTION;',
    );
    await this.ensureConstraint(
      queryRunner,
      'fk_po_projects_owner_user',
      'ALTER TABLE "po_projects" ADD CONSTRAINT "fk_po_projects_owner_user" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;',
    );
    await this.ensureConstraint(
      queryRunner,
      'fk_po_projects_company',
      'ALTER TABLE "po_projects" ADD CONSTRAINT "fk_po_projects_company" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE NO ACTION;',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "po_project_processes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "project_id" uuid NOT NULL,
        "process_id" uuid NOT NULL,
        "sort_order" integer NOT NULL DEFAULT 0,
        "created_at" timestamp(6) NOT NULL DEFAULT now(),
        "updated_at" timestamp(6) NOT NULL DEFAULT now(),
        CONSTRAINT "PK_po_project_processes" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "uq_po_project_processes_tenant_project_process" ON "po_project_processes" ("tenant_id", "project_id", "process_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_po_project_processes_tenant_id" ON "po_project_processes" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_po_project_processes_tenant_project" ON "po_project_processes" ("tenant_id", "project_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_po_project_processes_tenant_process" ON "po_project_processes" ("tenant_id", "process_id")`);

    await this.ensureConstraint(
      queryRunner,
      'fk_po_project_processes_project',
      'ALTER TABLE "po_project_processes" ADD CONSTRAINT "fk_po_project_processes_project" FOREIGN KEY ("project_id") REFERENCES "po_projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION;',
    );
    await this.ensureConstraint(
      queryRunner,
      'fk_po_project_processes_process',
      'ALTER TABLE "po_project_processes" ADD CONSTRAINT "fk_po_project_processes_process" FOREIGN KEY ("process_id") REFERENCES "processes"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "po_milestones" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "process_id" uuid NOT NULL,
        "title" character varying(160) NOT NULL,
        "description" text,
        "due_date" date,
        "status" "PoMilestoneStatus" NOT NULL DEFAULT 'PLANNED',
        "sort_order" integer NOT NULL DEFAULT 0,
        "created_at" timestamp(6) NOT NULL DEFAULT now(),
        "updated_at" timestamp(6) NOT NULL DEFAULT now(),
        "deleted_at" timestamp(6),
        CONSTRAINT "PK_po_milestones" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_po_milestones_tenant_id" ON "po_milestones" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_po_milestones_tenant_process" ON "po_milestones" ("tenant_id", "process_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_po_milestones_tenant_status" ON "po_milestones" ("tenant_id", "status")`);

    await this.ensureConstraint(
      queryRunner,
      'fk_po_milestones_process',
      'ALTER TABLE "po_milestones" ADD CONSTRAINT "fk_po_milestones_process" FOREIGN KEY ("process_id") REFERENCES "processes"("id") ON DELETE CASCADE ON UPDATE NO ACTION;',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "po_deliverables" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "process_id" uuid NOT NULL,
        "title" character varying(160) NOT NULL,
        "description" text,
        "due_date" date,
        "value_amount" numeric(19,4),
        "currency_id" uuid,
        "status_id" uuid,
        "created_at" timestamp(6) NOT NULL DEFAULT now(),
        "updated_at" timestamp(6) NOT NULL DEFAULT now(),
        "deleted_at" timestamp(6),
        CONSTRAINT "PK_po_deliverables" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_po_deliverables_tenant_id" ON "po_deliverables" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_po_deliverables_tenant_process" ON "po_deliverables" ("tenant_id", "process_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_po_deliverables_tenant_status" ON "po_deliverables" ("tenant_id", "status_id")`);

    await this.ensureConstraint(
      queryRunner,
      'fk_po_deliverables_process',
      'ALTER TABLE "po_deliverables" ADD CONSTRAINT "fk_po_deliverables_process" FOREIGN KEY ("process_id") REFERENCES "processes"("id") ON DELETE CASCADE ON UPDATE NO ACTION;',
    );
    await this.ensureConstraint(
      queryRunner,
      'fk_po_deliverables_currency',
      'ALTER TABLE "po_deliverables" ADD CONSTRAINT "fk_po_deliverables_currency" FOREIGN KEY ("currency_id") REFERENCES "currencies"("id") ON DELETE SET NULL ON UPDATE NO ACTION;',
    );
    await this.ensureConstraint(
      queryRunner,
      'fk_po_deliverables_status',
      'ALTER TABLE "po_deliverables" ADD CONSTRAINT "fk_po_deliverables_status" FOREIGN KEY ("status_id") REFERENCES "po_deliverable_statuses"("id") ON DELETE SET NULL ON UPDATE NO ACTION;',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "po_checklists" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "process_id" uuid NOT NULL,
        "name" character varying(160) NOT NULL,
        "created_at" timestamp(6) NOT NULL DEFAULT now(),
        "updated_at" timestamp(6) NOT NULL DEFAULT now(),
        "deleted_at" timestamp(6),
        CONSTRAINT "PK_po_checklists" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_po_checklists_tenant_id" ON "po_checklists" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_po_checklists_tenant_process" ON "po_checklists" ("tenant_id", "process_id")`);

    await this.ensureConstraint(
      queryRunner,
      'fk_po_checklists_process',
      'ALTER TABLE "po_checklists" ADD CONSTRAINT "fk_po_checklists_process" FOREIGN KEY ("process_id") REFERENCES "processes"("id") ON DELETE CASCADE ON UPDATE NO ACTION;',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "po_checklist_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "checklist_id" uuid NOT NULL,
        "title" character varying(160) NOT NULL,
        "is_required" boolean NOT NULL DEFAULT true,
        "status" "PoChecklistItemStatus" NOT NULL DEFAULT 'OPEN',
        "assigned_user_id" uuid,
        "due_date" date,
        "sort_order" integer NOT NULL DEFAULT 0,
        "created_at" timestamp(6) NOT NULL DEFAULT now(),
        "updated_at" timestamp(6) NOT NULL DEFAULT now(),
        "deleted_at" timestamp(6),
        CONSTRAINT "PK_po_checklist_items" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_po_checklist_items_tenant_id" ON "po_checklist_items" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_po_checklist_items_tenant_checklist" ON "po_checklist_items" ("tenant_id", "checklist_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_po_checklist_items_tenant_status" ON "po_checklist_items" ("tenant_id", "status")`);

    await this.ensureConstraint(
      queryRunner,
      'fk_po_checklist_items_checklist',
      'ALTER TABLE "po_checklist_items" ADD CONSTRAINT "fk_po_checklist_items_checklist" FOREIGN KEY ("checklist_id") REFERENCES "po_checklists"("id") ON DELETE CASCADE ON UPDATE NO ACTION;',
    );
    await this.ensureConstraint(
      queryRunner,
      'fk_po_checklist_items_assigned_user',
      'ALTER TABLE "po_checklist_items" ADD CONSTRAINT "fk_po_checklist_items_assigned_user" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "po_work_orders" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "code" character varying(60) NOT NULL,
        "title" character varying(160) NOT NULL,
        "description" text,
        "process_id" uuid,
        "project_id" uuid,
        "priority" "PoWorkOrderPriority" NOT NULL DEFAULT 'MEDIUM',
        "status_id" uuid,
        "planned_start" timestamp(6),
        "planned_end" timestamp(6),
        "actual_start" timestamp(6),
        "actual_end" timestamp(6),
        "estimated_hours" numeric(10,2),
        "created_by_user_id" uuid NOT NULL,
        "owner_user_id" uuid,
        "created_at" timestamp(6) NOT NULL DEFAULT now(),
        "updated_at" timestamp(6) NOT NULL DEFAULT now(),
        "deleted_at" timestamp(6),
        CONSTRAINT "PK_po_work_orders" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "uq_po_work_orders_tenant_code" ON "po_work_orders" ("tenant_id", "code")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_po_work_orders_tenant_id" ON "po_work_orders" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_po_work_orders_tenant_status" ON "po_work_orders" ("tenant_id", "status_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_po_work_orders_tenant_priority" ON "po_work_orders" ("tenant_id", "priority")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_po_work_orders_tenant_project" ON "po_work_orders" ("tenant_id", "project_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_po_work_orders_tenant_process" ON "po_work_orders" ("tenant_id", "process_id")`);

    await this.ensureConstraint(
      queryRunner,
      'fk_po_work_orders_process',
      'ALTER TABLE "po_work_orders" ADD CONSTRAINT "fk_po_work_orders_process" FOREIGN KEY ("process_id") REFERENCES "processes"("id") ON DELETE SET NULL ON UPDATE NO ACTION;',
    );
    await this.ensureConstraint(
      queryRunner,
      'fk_po_work_orders_project',
      'ALTER TABLE "po_work_orders" ADD CONSTRAINT "fk_po_work_orders_project" FOREIGN KEY ("project_id") REFERENCES "po_projects"("id") ON DELETE SET NULL ON UPDATE NO ACTION;',
    );
    await this.ensureConstraint(
      queryRunner,
      'fk_po_work_orders_status',
      'ALTER TABLE "po_work_orders" ADD CONSTRAINT "fk_po_work_orders_status" FOREIGN KEY ("status_id") REFERENCES "po_work_order_statuses"("id") ON DELETE SET NULL ON UPDATE NO ACTION;',
    );
    await this.ensureConstraint(
      queryRunner,
      'fk_po_work_orders_created_by',
      'ALTER TABLE "po_work_orders" ADD CONSTRAINT "fk_po_work_orders_created_by" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;',
    );
    await this.ensureConstraint(
      queryRunner,
      'fk_po_work_orders_owner',
      'ALTER TABLE "po_work_orders" ADD CONSTRAINT "fk_po_work_orders_owner" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "po_work_order_assignments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "work_order_id" uuid NOT NULL,
        "resource_id" uuid NOT NULL,
        "role_id" uuid,
        "allocation_percent" integer,
        "planned_hours" numeric(10,2),
        "created_at" timestamp(6) NOT NULL DEFAULT now(),
        "updated_at" timestamp(6) NOT NULL DEFAULT now(),
        CONSTRAINT "PK_po_work_order_assignments" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "uq_po_work_order_assignments_tenant_work_order_resource" ON "po_work_order_assignments" ("tenant_id", "work_order_id", "resource_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_po_work_order_assignments_tenant_id" ON "po_work_order_assignments" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_po_work_order_assignments_tenant_work_order" ON "po_work_order_assignments" ("tenant_id", "work_order_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_po_work_order_assignments_tenant_resource" ON "po_work_order_assignments" ("tenant_id", "resource_id")`);

    await this.ensureConstraint(
      queryRunner,
      'fk_po_work_order_assignments_work_order',
      'ALTER TABLE "po_work_order_assignments" ADD CONSTRAINT "fk_po_work_order_assignments_work_order" FOREIGN KEY ("work_order_id") REFERENCES "po_work_orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION;',
    );
    await this.ensureConstraint(
      queryRunner,
      'fk_po_work_order_assignments_resource',
      'ALTER TABLE "po_work_order_assignments" ADD CONSTRAINT "fk_po_work_order_assignments_resource" FOREIGN KEY ("resource_id") REFERENCES "service_resources"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;',
    );
    await this.ensureConstraint(
      queryRunner,
      'fk_po_work_order_assignments_role',
      'ALTER TABLE "po_work_order_assignments" ADD CONSTRAINT "fk_po_work_order_assignments_role" FOREIGN KEY ("role_id") REFERENCES "po_resource_roles"("id") ON DELETE SET NULL ON UPDATE NO ACTION;',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "po_work_order_appointments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "work_order_id" uuid NOT NULL,
        "appointment_id" uuid NOT NULL,
        "created_at" timestamp(6) NOT NULL DEFAULT now(),
        "updated_at" timestamp(6) NOT NULL DEFAULT now(),
        CONSTRAINT "PK_po_work_order_appointments" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "uq_po_work_order_appointments_tenant_pair" ON "po_work_order_appointments" ("tenant_id", "work_order_id", "appointment_id")`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "uq_po_work_order_appointments_appointment" ON "po_work_order_appointments" ("appointment_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_po_work_order_appointments_tenant_id" ON "po_work_order_appointments" ("tenant_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_po_work_order_appointments_tenant_work_order" ON "po_work_order_appointments" ("tenant_id", "work_order_id")`);

    await this.ensureConstraint(
      queryRunner,
      'fk_po_work_order_appointments_work_order',
      'ALTER TABLE "po_work_order_appointments" ADD CONSTRAINT "fk_po_work_order_appointments_work_order" FOREIGN KEY ("work_order_id") REFERENCES "po_work_orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION;',
    );
    await this.ensureConstraint(
      queryRunner,
      'fk_po_work_order_appointments_appointment',
      'ALTER TABLE "po_work_order_appointments" ADD CONSTRAINT "fk_po_work_order_appointments_appointment" FOREIGN KEY ("appointment_id") REFERENCES "service_appointments"("id") ON DELETE CASCADE ON UPDATE NO ACTION;',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "po_work_order_appointments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "po_work_order_assignments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "po_work_orders"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "po_checklist_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "po_checklists"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "po_deliverables"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "po_milestones"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "po_project_processes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "po_projects"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "po_resource_roles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "po_work_order_statuses"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "po_deliverable_statuses"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "po_project_statuses"`);

    await queryRunner.query(`DROP TYPE IF EXISTS "PoWorkOrderPriority"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "PoChecklistItemStatus"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "PoMilestoneStatus"`);
  }
}
