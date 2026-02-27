
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'HrEmployeeGender') THEN
    CREATE TYPE "HrEmployeeGender" AS ENUM ('MALE', 'FEMALE', 'OTHER');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'HrLeaveRequestStatus') THEN
    CREATE TYPE "HrLeaveRequestStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'HrSkillProficiencyLevel') THEN
    CREATE TYPE "HrSkillProficiencyLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'HrEmployeeCertificationStatus') THEN
    CREATE TYPE "HrEmployeeCertificationStatus" AS ENUM ('VALID', 'EXPIRED', 'REVOKED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'HrLifecycleTemplateType') THEN
    CREATE TYPE "HrLifecycleTemplateType" AS ENUM ('ONBOARDING', 'OFFBOARDING');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'HrLifecycleResponsibleRole') THEN
    CREATE TYPE "HrLifecycleResponsibleRole" AS ENUM ('HR', 'MANAGER', 'IT', 'FINANCE', 'EMPLOYEE');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'HrLifecycleStatus') THEN
    CREATE TYPE "HrLifecycleStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'HrLifecycleTaskStatus') THEN
    CREATE TYPE "HrLifecycleTaskStatus" AS ENUM ('OPEN', 'DOING', 'DONE', 'BLOCKED', 'CANCELED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "hr_employment_statuses" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" uuid NOT NULL,
  "name" character varying(120) NOT NULL,
  "code" character varying(40) NOT NULL,
  "color" character varying(20),
  "is_default" boolean NOT NULL DEFAULT false,
  "sort_order" integer NOT NULL DEFAULT 0,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp(6) NOT NULL DEFAULT now(),
  "updated_at" timestamp(6) NOT NULL DEFAULT now(),
  "deleted_at" timestamp(6),
  CONSTRAINT "PK_hr_employment_statuses" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_hr_employment_statuses_tenant_code" ON "hr_employment_statuses" ("tenant_id", "code");
CREATE INDEX IF NOT EXISTS "IDX_hr_employment_statuses_tenant_id" ON "hr_employment_statuses" ("tenant_id");

CREATE TABLE IF NOT EXISTS "hr_document_types" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" uuid NOT NULL,
  "name" character varying(120) NOT NULL,
  "code" character varying(40) NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp(6) NOT NULL DEFAULT now(),
  "updated_at" timestamp(6) NOT NULL DEFAULT now(),
  "deleted_at" timestamp(6),
  CONSTRAINT "PK_hr_document_types" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_hr_document_types_tenant_code" ON "hr_document_types" ("tenant_id", "code");
CREATE INDEX IF NOT EXISTS "IDX_hr_document_types_tenant_id" ON "hr_document_types" ("tenant_id");

CREATE TABLE IF NOT EXISTS "hr_marital_statuses" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" uuid NOT NULL,
  "name" character varying(120) NOT NULL,
  "code" character varying(40) NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp(6) NOT NULL DEFAULT now(),
  "updated_at" timestamp(6) NOT NULL DEFAULT now(),
  "deleted_at" timestamp(6),
  CONSTRAINT "PK_hr_marital_statuses" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_hr_marital_statuses_tenant_code" ON "hr_marital_statuses" ("tenant_id", "code");
CREATE INDEX IF NOT EXISTS "IDX_hr_marital_statuses_tenant_id" ON "hr_marital_statuses" ("tenant_id");

CREATE TABLE IF NOT EXISTS "hr_positions" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" uuid NOT NULL,
  "name" character varying(120) NOT NULL,
  "code" character varying(40),
  "level" integer,
  "description" text,
  "is_leadership" boolean NOT NULL DEFAULT false,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp(6) NOT NULL DEFAULT now(),
  "updated_at" timestamp(6) NOT NULL DEFAULT now(),
  "deleted_at" timestamp(6),
  CONSTRAINT "PK_hr_positions" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_hr_positions_tenant_name" ON "hr_positions" ("tenant_id", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_hr_positions_tenant_code" ON "hr_positions" ("tenant_id", "code") WHERE "code" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "IDX_hr_positions_tenant_id" ON "hr_positions" ("tenant_id");

CREATE TABLE IF NOT EXISTS "hr_work_locations" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" uuid NOT NULL,
  "name" character varying(120) NOT NULL,
  "code" character varying(40),
  "address_json" jsonb,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp(6) NOT NULL DEFAULT now(),
  "updated_at" timestamp(6) NOT NULL DEFAULT now(),
  "deleted_at" timestamp(6),
  CONSTRAINT "PK_hr_work_locations" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_hr_work_locations_tenant_name" ON "hr_work_locations" ("tenant_id", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_hr_work_locations_tenant_code" ON "hr_work_locations" ("tenant_id", "code") WHERE "code" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "IDX_hr_work_locations_tenant_id" ON "hr_work_locations" ("tenant_id");

CREATE TABLE IF NOT EXISTS "hr_work_schedules" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" uuid NOT NULL,
  "name" character varying(120) NOT NULL,
  "weekly_minutes" integer,
  "schedule_json" jsonb NOT NULL,
  "is_default" boolean NOT NULL DEFAULT false,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp(6) NOT NULL DEFAULT now(),
  "updated_at" timestamp(6) NOT NULL DEFAULT now(),
  "deleted_at" timestamp(6),
  CONSTRAINT "PK_hr_work_schedules" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_hr_work_schedules_tenant_name" ON "hr_work_schedules" ("tenant_id", "name");
CREATE INDEX IF NOT EXISTS "IDX_hr_work_schedules_tenant_id" ON "hr_work_schedules" ("tenant_id");

CREATE TABLE IF NOT EXISTS "hr_leave_types" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" uuid NOT NULL,
  "name" character varying(120) NOT NULL,
  "code" character varying(40) NOT NULL,
  "requires_approval" boolean NOT NULL DEFAULT true,
  "is_paid" boolean NOT NULL DEFAULT true,
  "counts_as_vacation" boolean NOT NULL DEFAULT false,
  "max_days_per_year" integer,
  "allow_hourly" boolean NOT NULL DEFAULT false,
  "color" character varying(20),
  "sort_order" integer NOT NULL DEFAULT 0,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp(6) NOT NULL DEFAULT now(),
  "updated_at" timestamp(6) NOT NULL DEFAULT now(),
  "deleted_at" timestamp(6),
  CONSTRAINT "PK_hr_leave_types" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_hr_leave_types_tenant_code" ON "hr_leave_types" ("tenant_id", "code");
CREATE INDEX IF NOT EXISTS "IDX_hr_leave_types_tenant_id" ON "hr_leave_types" ("tenant_id");
CREATE TABLE IF NOT EXISTS "hr_skill_categories" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" uuid NOT NULL,
  "name" character varying(120) NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp(6) NOT NULL DEFAULT now(),
  "updated_at" timestamp(6) NOT NULL DEFAULT now(),
  "deleted_at" timestamp(6),
  CONSTRAINT "PK_hr_skill_categories" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_hr_skill_categories_tenant_name" ON "hr_skill_categories" ("tenant_id", "name");
CREATE INDEX IF NOT EXISTS "IDX_hr_skill_categories_tenant_id" ON "hr_skill_categories" ("tenant_id");

CREATE TABLE IF NOT EXISTS "hr_skills" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" uuid NOT NULL,
  "name" character varying(120) NOT NULL,
  "category_id" uuid,
  "description" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp(6) NOT NULL DEFAULT now(),
  "updated_at" timestamp(6) NOT NULL DEFAULT now(),
  "deleted_at" timestamp(6),
  CONSTRAINT "PK_hr_skills" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_hr_skills_tenant_name" ON "hr_skills" ("tenant_id", "name");
CREATE INDEX IF NOT EXISTS "IDX_hr_skills_tenant_id" ON "hr_skills" ("tenant_id");
CREATE INDEX IF NOT EXISTS "IDX_hr_skills_tenant_category" ON "hr_skills" ("tenant_id", "category_id");

CREATE TABLE IF NOT EXISTS "hr_certifications" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" uuid NOT NULL,
  "name" character varying(120) NOT NULL,
  "issuer" character varying(120),
  "validity_months" integer,
  "description" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp(6) NOT NULL DEFAULT now(),
  "updated_at" timestamp(6) NOT NULL DEFAULT now(),
  "deleted_at" timestamp(6),
  CONSTRAINT "PK_hr_certifications" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_hr_certifications_tenant_name" ON "hr_certifications" ("tenant_id", "name");
CREATE INDEX IF NOT EXISTS "IDX_hr_certifications_tenant_id" ON "hr_certifications" ("tenant_id");

CREATE TABLE IF NOT EXISTS "hr_lifecycle_templates" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" uuid NOT NULL,
  "name" character varying(160) NOT NULL,
  "type" "HrLifecycleTemplateType" NOT NULL,
  "description" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp(6) NOT NULL DEFAULT now(),
  "updated_at" timestamp(6) NOT NULL DEFAULT now(),
  "deleted_at" timestamp(6),
  CONSTRAINT "PK_hr_lifecycle_templates" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_hr_lifecycle_templates_tenant_name_type" ON "hr_lifecycle_templates" ("tenant_id", "name", "type");
CREATE INDEX IF NOT EXISTS "IDX_hr_lifecycle_templates_tenant_id" ON "hr_lifecycle_templates" ("tenant_id");

CREATE TABLE IF NOT EXISTS "hr_employees" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" uuid NOT NULL,
  "employee_number" character varying(40),
  "full_name" character varying(160) NOT NULL,
  "preferred_name" character varying(80),
  "email_work" character varying(160),
  "phone_work" character varying(40),
  "phone_mobile" character varying(40),
  "birth_date" date,
  "gender" "HrEmployeeGender",
  "marital_status_id" uuid,
  "document_type_id" uuid,
  "document_number" character varying(60),
  "nationality" character varying(80),
  "address_json" jsonb,
  "profile_picture_key" character varying(255),
  "notes" text,
  "user_id" uuid,
  "employment_status_id" uuid NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp(6) NOT NULL DEFAULT now(),
  "updated_at" timestamp(6) NOT NULL DEFAULT now(),
  "deleted_at" timestamp(6),
  CONSTRAINT "PK_hr_employees" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_hr_employees_tenant_employee_number" ON "hr_employees" ("tenant_id", "employee_number") WHERE "employee_number" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "uq_hr_employees_tenant_user" ON "hr_employees" ("tenant_id", "user_id") WHERE "user_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "IDX_hr_employees_tenant_id" ON "hr_employees" ("tenant_id");
CREATE INDEX IF NOT EXISTS "IDX_hr_employees_tenant_status" ON "hr_employees" ("tenant_id", "employment_status_id");

CREATE TABLE IF NOT EXISTS "hr_departments" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" uuid NOT NULL,
  "name" character varying(120) NOT NULL,
  "code" character varying(40),
  "description" text,
  "parent_department_id" uuid,
  "manager_employee_id" uuid,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp(6) NOT NULL DEFAULT now(),
  "updated_at" timestamp(6) NOT NULL DEFAULT now(),
  "deleted_at" timestamp(6),
  CONSTRAINT "PK_hr_departments" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_hr_departments_tenant_name" ON "hr_departments" ("tenant_id", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_hr_departments_tenant_code" ON "hr_departments" ("tenant_id", "code") WHERE "code" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "IDX_hr_departments_tenant_id" ON "hr_departments" ("tenant_id");

CREATE TABLE IF NOT EXISTS "hr_department_assignments" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" uuid NOT NULL,
  "employee_id" uuid NOT NULL,
  "department_id" uuid NOT NULL,
  "position_id" uuid NOT NULL,
  "manager_employee_id" uuid,
  "start_date" date NOT NULL,
  "end_date" date,
  "work_location_id" uuid,
  "cost_center" character varying(60),
  "created_at" timestamp(6) NOT NULL DEFAULT now(),
  "updated_at" timestamp(6) NOT NULL DEFAULT now(),
  "deleted_at" timestamp(6),
  CONSTRAINT "PK_hr_department_assignments" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "IDX_hr_department_assignments_tenant_id" ON "hr_department_assignments" ("tenant_id");
CREATE INDEX IF NOT EXISTS "IDX_hr_department_assignments_tenant_employee" ON "hr_department_assignments" ("tenant_id", "employee_id");
CREATE INDEX IF NOT EXISTS "IDX_hr_department_assignments_tenant_department" ON "hr_department_assignments" ("tenant_id", "department_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_hr_department_assignments_active_per_employee" ON "hr_department_assignments" ("tenant_id", "employee_id") WHERE "end_date" IS NULL AND "deleted_at" IS NULL;

CREATE TABLE IF NOT EXISTS "hr_employee_schedule_assignments" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" uuid NOT NULL,
  "employee_id" uuid NOT NULL,
  "work_schedule_id" uuid NOT NULL,
  "start_date" date NOT NULL,
  "end_date" date,
  "created_at" timestamp(6) NOT NULL DEFAULT now(),
  "updated_at" timestamp(6) NOT NULL DEFAULT now(),
  "deleted_at" timestamp(6),
  CONSTRAINT "PK_hr_employee_schedule_assignments" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "IDX_hr_employee_schedule_assignments_tenant_id" ON "hr_employee_schedule_assignments" ("tenant_id");
CREATE INDEX IF NOT EXISTS "IDX_hr_employee_schedule_assignments_tenant_employee" ON "hr_employee_schedule_assignments" ("tenant_id", "employee_id");
CREATE TABLE IF NOT EXISTS "hr_leave_requests" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" uuid NOT NULL,
  "employee_id" uuid NOT NULL,
  "leave_type_id" uuid NOT NULL,
  "start_datetime" timestamptz(6) NOT NULL,
  "end_datetime" timestamptz(6) NOT NULL,
  "duration_minutes" integer NOT NULL,
  "reason" text,
  "attachment_key" character varying(255),
  "approver_employee_id" uuid,
  "status" "HrLeaveRequestStatus" NOT NULL DEFAULT 'DRAFT',
  "decision_reason" text,
  "decided_at" timestamptz(6),
  "created_at" timestamp(6) NOT NULL DEFAULT now(),
  "updated_at" timestamp(6) NOT NULL DEFAULT now(),
  "deleted_at" timestamp(6),
  CONSTRAINT "PK_hr_leave_requests" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "IDX_hr_leave_requests_tenant_id" ON "hr_leave_requests" ("tenant_id");
CREATE INDEX IF NOT EXISTS "IDX_hr_leave_requests_tenant_employee" ON "hr_leave_requests" ("tenant_id", "employee_id");
CREATE INDEX IF NOT EXISTS "IDX_hr_leave_requests_tenant_status" ON "hr_leave_requests" ("tenant_id", "status");

CREATE TABLE IF NOT EXISTS "hr_employee_skills" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" uuid NOT NULL,
  "employee_id" uuid NOT NULL,
  "skill_id" uuid NOT NULL,
  "proficiency_level" "HrSkillProficiencyLevel" NOT NULL DEFAULT 'BEGINNER',
  "years_experience" integer,
  "notes" text,
  "created_at" timestamp(6) NOT NULL DEFAULT now(),
  "updated_at" timestamp(6) NOT NULL DEFAULT now(),
  "deleted_at" timestamp(6),
  CONSTRAINT "PK_hr_employee_skills" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_hr_employee_skills_tenant_employee_skill" ON "hr_employee_skills" ("tenant_id", "employee_id", "skill_id");
CREATE INDEX IF NOT EXISTS "IDX_hr_employee_skills_tenant_id" ON "hr_employee_skills" ("tenant_id");

CREATE TABLE IF NOT EXISTS "hr_employee_certifications" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" uuid NOT NULL,
  "employee_id" uuid NOT NULL,
  "certification_id" uuid NOT NULL,
  "issued_at" date,
  "expires_at" date,
  "certificate_number" character varying(80),
  "attachment_key" character varying(255),
  "status" "HrEmployeeCertificationStatus" NOT NULL DEFAULT 'VALID',
  "created_at" timestamp(6) NOT NULL DEFAULT now(),
  "updated_at" timestamp(6) NOT NULL DEFAULT now(),
  "deleted_at" timestamp(6),
  CONSTRAINT "PK_hr_employee_certifications" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "IDX_hr_employee_certifications_tenant_id" ON "hr_employee_certifications" ("tenant_id");
CREATE INDEX IF NOT EXISTS "IDX_hr_employee_certifications_tenant_employee" ON "hr_employee_certifications" ("tenant_id", "employee_id");

CREATE TABLE IF NOT EXISTS "hr_lifecycle_stages" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" uuid NOT NULL,
  "template_id" uuid NOT NULL,
  "name" character varying(120) NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  "wip_limit" integer,
  "color" character varying(20),
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp(6) NOT NULL DEFAULT now(),
  "updated_at" timestamp(6) NOT NULL DEFAULT now(),
  "deleted_at" timestamp(6),
  CONSTRAINT "PK_hr_lifecycle_stages" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "IDX_hr_lifecycle_stages_tenant_id" ON "hr_lifecycle_stages" ("tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_hr_lifecycle_stages_template_order" ON "hr_lifecycle_stages" ("template_id", "sort_order") WHERE "deleted_at" IS NULL;

CREATE TABLE IF NOT EXISTS "hr_lifecycle_tasks" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" uuid NOT NULL,
  "template_id" uuid NOT NULL,
  "stage_id" uuid,
  "title" character varying(160) NOT NULL,
  "description" text,
  "responsible_role" "HrLifecycleResponsibleRole" NOT NULL DEFAULT 'HR',
  "due_days_after_start" integer,
  "requires_attachment" boolean NOT NULL DEFAULT false,
  "is_mandatory" boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 0,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp(6) NOT NULL DEFAULT now(),
  "updated_at" timestamp(6) NOT NULL DEFAULT now(),
  "deleted_at" timestamp(6),
  CONSTRAINT "PK_hr_lifecycle_tasks" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "IDX_hr_lifecycle_tasks_tenant_id" ON "hr_lifecycle_tasks" ("tenant_id");
CREATE INDEX IF NOT EXISTS "IDX_hr_lifecycle_tasks_tenant_template" ON "hr_lifecycle_tasks" ("tenant_id", "template_id");

CREATE TABLE IF NOT EXISTS "hr_employee_lifecycles" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" uuid NOT NULL,
  "employee_id" uuid NOT NULL,
  "template_id" uuid NOT NULL,
  "start_date" date NOT NULL,
  "target_end_date" date,
  "status" "HrLifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
  "current_stage_id" uuid,
  "created_by_user_id" uuid NOT NULL,
  "created_at" timestamp(6) NOT NULL DEFAULT now(),
  "updated_at" timestamp(6) NOT NULL DEFAULT now(),
  "deleted_at" timestamp(6),
  CONSTRAINT "PK_hr_employee_lifecycles" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "IDX_hr_employee_lifecycles_tenant_id" ON "hr_employee_lifecycles" ("tenant_id");
CREATE INDEX IF NOT EXISTS "IDX_hr_employee_lifecycles_tenant_employee" ON "hr_employee_lifecycles" ("tenant_id", "employee_id");

CREATE TABLE IF NOT EXISTS "hr_employee_lifecycle_tasks" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" uuid NOT NULL,
  "employee_lifecycle_id" uuid NOT NULL,
  "template_task_id" uuid,
  "stage_id" uuid,
  "title" character varying(160) NOT NULL,
  "description" text,
  "responsible_employee_id" uuid,
  "due_date" date,
  "completed_at" timestamptz(6),
  "completed_by_user_id" uuid,
  "status" "HrLifecycleTaskStatus" NOT NULL DEFAULT 'OPEN',
  "attachment_key" character varying(255),
  "notes" text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp(6) NOT NULL DEFAULT now(),
  "updated_at" timestamp(6) NOT NULL DEFAULT now(),
  "deleted_at" timestamp(6),
  CONSTRAINT "PK_hr_employee_lifecycle_tasks" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "IDX_hr_employee_lifecycle_tasks_tenant_id" ON "hr_employee_lifecycle_tasks" ("tenant_id");
CREATE INDEX IF NOT EXISTS "IDX_hr_employee_lifecycle_tasks_tenant_lifecycle" ON "hr_employee_lifecycle_tasks" ("tenant_id", "employee_lifecycle_id");
ALTER TABLE "hr_skills"
  ADD CONSTRAINT "fk_hr_skills_category"
  FOREIGN KEY ("category_id") REFERENCES "hr_skill_categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "hr_employees"
  ADD CONSTRAINT "fk_hr_employees_employment_status"
  FOREIGN KEY ("employment_status_id") REFERENCES "hr_employment_statuses"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "hr_employees"
  ADD CONSTRAINT "fk_hr_employees_marital_status"
  FOREIGN KEY ("marital_status_id") REFERENCES "hr_marital_statuses"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "hr_employees"
  ADD CONSTRAINT "fk_hr_employees_document_type"
  FOREIGN KEY ("document_type_id") REFERENCES "hr_document_types"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "hr_employees"
  ADD CONSTRAINT "fk_hr_employees_user"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "hr_departments"
  ADD CONSTRAINT "fk_hr_departments_parent"
  FOREIGN KEY ("parent_department_id") REFERENCES "hr_departments"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "hr_departments"
  ADD CONSTRAINT "fk_hr_departments_manager"
  FOREIGN KEY ("manager_employee_id") REFERENCES "hr_employees"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "hr_department_assignments"
  ADD CONSTRAINT "fk_hr_department_assignments_employee"
  FOREIGN KEY ("employee_id") REFERENCES "hr_employees"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "hr_department_assignments"
  ADD CONSTRAINT "fk_hr_department_assignments_department"
  FOREIGN KEY ("department_id") REFERENCES "hr_departments"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "hr_department_assignments"
  ADD CONSTRAINT "fk_hr_department_assignments_position"
  FOREIGN KEY ("position_id") REFERENCES "hr_positions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "hr_department_assignments"
  ADD CONSTRAINT "fk_hr_department_assignments_manager"
  FOREIGN KEY ("manager_employee_id") REFERENCES "hr_employees"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "hr_department_assignments"
  ADD CONSTRAINT "fk_hr_department_assignments_location"
  FOREIGN KEY ("work_location_id") REFERENCES "hr_work_locations"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "hr_employee_schedule_assignments"
  ADD CONSTRAINT "fk_hr_employee_schedule_assignments_employee"
  FOREIGN KEY ("employee_id") REFERENCES "hr_employees"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "hr_employee_schedule_assignments"
  ADD CONSTRAINT "fk_hr_employee_schedule_assignments_schedule"
  FOREIGN KEY ("work_schedule_id") REFERENCES "hr_work_schedules"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "hr_leave_requests"
  ADD CONSTRAINT "fk_hr_leave_requests_employee"
  FOREIGN KEY ("employee_id") REFERENCES "hr_employees"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "hr_leave_requests"
  ADD CONSTRAINT "fk_hr_leave_requests_type"
  FOREIGN KEY ("leave_type_id") REFERENCES "hr_leave_types"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "hr_leave_requests"
  ADD CONSTRAINT "fk_hr_leave_requests_approver"
  FOREIGN KEY ("approver_employee_id") REFERENCES "hr_employees"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "hr_employee_skills"
  ADD CONSTRAINT "fk_hr_employee_skills_employee"
  FOREIGN KEY ("employee_id") REFERENCES "hr_employees"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "hr_employee_skills"
  ADD CONSTRAINT "fk_hr_employee_skills_skill"
  FOREIGN KEY ("skill_id") REFERENCES "hr_skills"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "hr_employee_certifications"
  ADD CONSTRAINT "fk_hr_employee_certifications_employee"
  FOREIGN KEY ("employee_id") REFERENCES "hr_employees"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "hr_employee_certifications"
  ADD CONSTRAINT "fk_hr_employee_certifications_certification"
  FOREIGN KEY ("certification_id") REFERENCES "hr_certifications"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "hr_lifecycle_stages"
  ADD CONSTRAINT "fk_hr_lifecycle_stages_template"
  FOREIGN KEY ("template_id") REFERENCES "hr_lifecycle_templates"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "hr_lifecycle_tasks"
  ADD CONSTRAINT "fk_hr_lifecycle_tasks_template"
  FOREIGN KEY ("template_id") REFERENCES "hr_lifecycle_templates"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "hr_lifecycle_tasks"
  ADD CONSTRAINT "fk_hr_lifecycle_tasks_stage"
  FOREIGN KEY ("stage_id") REFERENCES "hr_lifecycle_stages"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "hr_employee_lifecycles"
  ADD CONSTRAINT "fk_hr_employee_lifecycles_employee"
  FOREIGN KEY ("employee_id") REFERENCES "hr_employees"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "hr_employee_lifecycles"
  ADD CONSTRAINT "fk_hr_employee_lifecycles_template"
  FOREIGN KEY ("template_id") REFERENCES "hr_lifecycle_templates"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "hr_employee_lifecycles"
  ADD CONSTRAINT "fk_hr_employee_lifecycles_current_stage"
  FOREIGN KEY ("current_stage_id") REFERENCES "hr_lifecycle_stages"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "hr_employee_lifecycles"
  ADD CONSTRAINT "fk_hr_employee_lifecycles_created_by"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "hr_employee_lifecycle_tasks"
  ADD CONSTRAINT "fk_hr_employee_lifecycle_tasks_lifecycle"
  FOREIGN KEY ("employee_lifecycle_id") REFERENCES "hr_employee_lifecycles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "hr_employee_lifecycle_tasks"
  ADD CONSTRAINT "fk_hr_employee_lifecycle_tasks_template_task"
  FOREIGN KEY ("template_task_id") REFERENCES "hr_lifecycle_tasks"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "hr_employee_lifecycle_tasks"
  ADD CONSTRAINT "fk_hr_employee_lifecycle_tasks_stage"
  FOREIGN KEY ("stage_id") REFERENCES "hr_lifecycle_stages"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "hr_employee_lifecycle_tasks"
  ADD CONSTRAINT "fk_hr_employee_lifecycle_tasks_responsible"
  FOREIGN KEY ("responsible_employee_id") REFERENCES "hr_employees"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "hr_employee_lifecycle_tasks"
  ADD CONSTRAINT "fk_hr_employee_lifecycle_tasks_completed_by"
  FOREIGN KEY ("completed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
