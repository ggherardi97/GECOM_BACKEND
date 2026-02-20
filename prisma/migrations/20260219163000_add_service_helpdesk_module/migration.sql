-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'WAITING_INTERNAL', 'RESOLVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "IncidentPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "IncidentChannel" AS ENUM ('EMAIL', 'PHONE', 'WHATSAPP', 'PORTAL', 'INTERNAL', 'API');

-- CreateEnum
CREATE TYPE "IncidentImpact" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "IncidentUrgency" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "SlaInstanceStatus" AS ENUM ('RUNNING', 'PAUSED', 'MET', 'BREACHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SlaKpiType" AS ENUM ('FIRST_RESPONSE', 'RESOLUTION', 'CUSTOM');

-- CreateEnum
CREATE TYPE "SlaEventType" AS ENUM ('START', 'PAUSE', 'RESUME', 'WARNING', 'BREACH', 'MET', 'RECALC', 'CANCEL');

-- CreateEnum
CREATE TYPE "SlaInstanceKpiStatus" AS ENUM ('RUNNING', 'PAUSED', 'MET', 'BREACHED');

-- CreateEnum
CREATE TYPE "QueueAssignmentMode" AS ENUM ('MANUAL', 'ROUND_ROBIN', 'LEAST_BUSY');

-- CreateEnum
CREATE TYPE "QueueMemberRole" AS ENUM ('AGENT', 'SUPERVISOR');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'RETIRED', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "TaskTypeChannel" AS ENUM ('SERVICE', 'CALL', 'EMAIL', 'WHATSAPP', 'VISIT', 'INTERNAL');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'DONE', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "CalendarExceptionType" AS ENUM ('HOLIDAY', 'SPECIAL_HOURS', 'BLACKOUT');

-- CreateTable
CREATE TABLE "incidents" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "number" VARCHAR(50) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "status" "IncidentStatus" NOT NULL DEFAULT 'NEW',
    "priority" "IncidentPriority" NOT NULL DEFAULT 'NORMAL',
    "channel" "IncidentChannel" NOT NULL DEFAULT 'PORTAL',
    "impact" "IncidentImpact",
    "urgency" "IncidentUrgency",
    "company_id" UUID NOT NULL,
    "contact_id" VARCHAR(100),
    "asset_id" UUID,
    "subject_id" UUID,
    "queue_id" UUID,
    "owner_user_id" UUID,
    "opened_by_user_id" UUID,
    "due_at" TIMESTAMP(6),
    "resolved_at" TIMESTAMP(6),
    "closed_at" TIMESTAMP(6),
    "sla_policy_id" UUID,
    "sla_instance_id" UUID,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_policies" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "business_calendar_id" UUID,
    "apply_when_json" JSONB,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sla_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_kpis" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "sla_policy_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "kpi_type" "SlaKpiType" NOT NULL,
    "start_condition" VARCHAR(100) NOT NULL,
    "start_status" "IncidentStatus",
    "stop_condition" VARCHAR(100) NOT NULL,
    "stop_status" "IncidentStatus",
    "pause_when_status_in" JSONB,
    "warning_after_minutes" INTEGER NOT NULL,
    "fail_after_minutes" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sla_kpis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_instances" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "incident_id" UUID NOT NULL,
    "sla_policy_id" UUID NOT NULL,
    "status" "SlaInstanceStatus" NOT NULL DEFAULT 'RUNNING',
    "started_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paused_at" TIMESTAMP(6),
    "completed_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sla_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_instance_kpis" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "sla_instance_id" UUID NOT NULL,
    "sla_kpi_id" UUID NOT NULL,
    "status" "SlaInstanceKpiStatus" NOT NULL DEFAULT 'RUNNING',
    "target_at" TIMESTAMP(6) NOT NULL,
    "warning_at" TIMESTAMP(6),
    "met_at" TIMESTAMP(6),
    "breached_at" TIMESTAMP(6),
    "elapsed_minutes" INTEGER NOT NULL DEFAULT 0,
    "last_tick_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sla_instance_kpis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_events" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "incident_id" UUID NOT NULL,
    "sla_instance_kpi_id" UUID,
    "event_type" "SlaEventType" NOT NULL,
    "occurred_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata_json" JSONB,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sla_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_queues" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "email" VARCHAR(255),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "assignment_mode" "QueueAssignmentMode" NOT NULL DEFAULT 'MANUAL',
    "default_sla_policy_id" UUID,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_queues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_queue_members" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "queue_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "QueueMemberRole" NOT NULL DEFAULT 'AGENT',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_queue_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_assets" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "asset_tag" VARCHAR(100),
    "serial_number" VARCHAR(120),
    "category" VARCHAR(120),
    "status" "AssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "purchase_date" DATE,
    "warranty_end_date" DATE,
    "notes" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_subjects" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "parent_id" UUID,
    "path" VARCHAR(600),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "default_sla_policy_id" UUID,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_calendars" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "timezone" VARCHAR(80) NOT NULL DEFAULT 'America/Sao_Paulo',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_calendars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_calendar_rules" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "calendar_id" UUID NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "start_time" TIME(6) NOT NULL,
    "end_time" TIME(6) NOT NULL,
    "is_working_time" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_calendar_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_calendar_exceptions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "calendar_id" UUID NOT NULL,
    "date_from" TIMESTAMP(6) NOT NULL,
    "date_to" TIMESTAMP(6) NOT NULL,
    "type" "CalendarExceptionType" NOT NULL,
    "notes" VARCHAR(255),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_calendar_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_resources" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "calendar_id" UUID,
    "skills_json" JSONB,
    "capacity_per_day" INTEGER NOT NULL DEFAULT 8,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_appointments" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "resource_id" UUID NOT NULL,
    "incident_id" UUID,
    "title" VARCHAR(255) NOT NULL,
    "start_at" TIMESTAMP(6) NOT NULL,
    "end_at" TIMESTAMP(6) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_task_types" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "default_duration_minutes" INTEGER,
    "channel" "TaskTypeChannel",
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_task_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_tasks" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tenant_id" UUID NOT NULL,
    "incident_id" UUID NOT NULL,
    "task_type_id" UUID,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "type" "TaskTypeChannel" NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "IncidentPriority" NOT NULL DEFAULT 'NORMAL',
    "assigned_to_user_id" UUID,
    "due_at" TIMESTAMP(6),
    "started_at" TIMESTAMP(6),
    "completed_at" TIMESTAMP(6),
    "estimated_minutes" INTEGER,
    "actual_minutes" INTEGER,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IDX_incidents_tenant_id" ON "incidents"("tenant_id");

-- CreateIndex
CREATE INDEX "IDX_incidents_tenant_status" ON "incidents"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "IDX_incidents_tenant_company" ON "incidents"("tenant_id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_incidents_tenant_number" ON "incidents"("tenant_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "uq_incidents_tenant_sla_instance" ON "incidents"("tenant_id", "sla_instance_id");

-- CreateIndex
CREATE INDEX "IDX_sla_policies_tenant_id" ON "sla_policies"("tenant_id");

-- CreateIndex
CREATE INDEX "IDX_sla_policies_tenant_active" ON "sla_policies"("tenant_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "uq_sla_policies_tenant_name" ON "sla_policies"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "IDX_sla_kpis_tenant_id" ON "sla_kpis"("tenant_id");

-- CreateIndex
CREATE INDEX "IDX_sla_kpis_tenant_policy" ON "sla_kpis"("tenant_id", "sla_policy_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_sla_kpis_tenant_policy_sort" ON "sla_kpis"("tenant_id", "sla_policy_id", "sort_order");

-- CreateIndex
CREATE INDEX "IDX_sla_instances_tenant_id" ON "sla_instances"("tenant_id");

-- CreateIndex
CREATE INDEX "IDX_sla_instances_tenant_status" ON "sla_instances"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "uq_sla_instances_incident" ON "sla_instances"("incident_id");

-- CreateIndex
CREATE INDEX "IDX_sla_instance_kpis_tenant_id" ON "sla_instance_kpis"("tenant_id");

-- CreateIndex
CREATE INDEX "IDX_sla_instance_kpis_tenant_instance" ON "sla_instance_kpis"("tenant_id", "sla_instance_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_sla_instance_kpis_tenant_instance_kpi" ON "sla_instance_kpis"("tenant_id", "sla_instance_id", "sla_kpi_id");

-- CreateIndex
CREATE INDEX "IDX_sla_events_tenant_id" ON "sla_events"("tenant_id");

-- CreateIndex
CREATE INDEX "IDX_sla_events_tenant_incident" ON "sla_events"("tenant_id", "incident_id");

-- CreateIndex
CREATE INDEX "IDX_service_queues_tenant_id" ON "service_queues"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_service_queues_tenant_name" ON "service_queues"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "IDX_service_queue_members_tenant_id" ON "service_queue_members"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_service_queue_members_tenant_queue_user" ON "service_queue_members"("tenant_id", "queue_id", "user_id");

-- CreateIndex
CREATE INDEX "IDX_customer_assets_tenant_id" ON "customer_assets"("tenant_id");

-- CreateIndex
CREATE INDEX "IDX_customer_assets_tenant_company" ON "customer_assets"("tenant_id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_customer_assets_tenant_asset_tag" ON "customer_assets"("tenant_id", "asset_tag");

-- CreateIndex
CREATE UNIQUE INDEX "uq_customer_assets_tenant_serial" ON "customer_assets"("tenant_id", "serial_number");

-- CreateIndex
CREATE INDEX "IDX_service_subjects_tenant_id" ON "service_subjects"("tenant_id");

-- CreateIndex
CREATE INDEX "IDX_service_subjects_tenant_path" ON "service_subjects"("tenant_id", "path");

-- CreateIndex
CREATE UNIQUE INDEX "uq_service_subjects_tenant_name_parent" ON "service_subjects"("tenant_id", "name", "parent_id");

-- CreateIndex
CREATE INDEX "IDX_service_calendars_tenant_id" ON "service_calendars"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_service_calendars_tenant_name" ON "service_calendars"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "IDX_service_calendar_rules_tenant_id" ON "service_calendar_rules"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_service_calendar_rules_slot" ON "service_calendar_rules"("tenant_id", "calendar_id", "day_of_week", "start_time", "end_time");

-- CreateIndex
CREATE INDEX "IDX_service_calendar_exceptions_tenant_id" ON "service_calendar_exceptions"("tenant_id");

-- CreateIndex
CREATE INDEX "IDX_service_calendar_exceptions_tenant_calendar_from" ON "service_calendar_exceptions"("tenant_id", "calendar_id", "date_from");

-- CreateIndex
CREATE INDEX "IDX_service_resources_tenant_id" ON "service_resources"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_service_resources_tenant_user" ON "service_resources"("tenant_id", "user_id");

-- CreateIndex
CREATE INDEX "IDX_service_appointments_tenant_id" ON "service_appointments"("tenant_id");

-- CreateIndex
CREATE INDEX "IDX_service_appointments_tenant_resource_start" ON "service_appointments"("tenant_id", "resource_id", "start_at");

-- CreateIndex
CREATE INDEX "IDX_service_task_types_tenant_id" ON "service_task_types"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_service_task_types_tenant_name" ON "service_task_types"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "IDX_service_tasks_tenant_id" ON "service_tasks"("tenant_id");

-- CreateIndex
CREATE INDEX "IDX_service_tasks_tenant_incident" ON "service_tasks"("tenant_id", "incident_id");

-- CreateIndex
CREATE INDEX "IDX_service_tasks_tenant_status" ON "service_tasks"("tenant_id", "status");

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "fk_incidents_company" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "fk_incidents_asset" FOREIGN KEY ("asset_id") REFERENCES "customer_assets"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "fk_incidents_subject" FOREIGN KEY ("subject_id") REFERENCES "service_subjects"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "fk_incidents_queue" FOREIGN KEY ("queue_id") REFERENCES "service_queues"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "fk_incidents_owner_user" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "fk_incidents_opened_by_user" FOREIGN KEY ("opened_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "fk_incidents_sla_policy" FOREIGN KEY ("sla_policy_id") REFERENCES "sla_policies"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "fk_incidents_sla_instance" FOREIGN KEY ("sla_instance_id") REFERENCES "sla_instances"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sla_policies" ADD CONSTRAINT "fk_sla_policies_calendar" FOREIGN KEY ("business_calendar_id") REFERENCES "service_calendars"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sla_kpis" ADD CONSTRAINT "fk_sla_kpis_policy" FOREIGN KEY ("sla_policy_id") REFERENCES "sla_policies"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sla_instances" ADD CONSTRAINT "fk_sla_instances_incident" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sla_instances" ADD CONSTRAINT "fk_sla_instances_policy" FOREIGN KEY ("sla_policy_id") REFERENCES "sla_policies"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sla_instance_kpis" ADD CONSTRAINT "fk_sla_instance_kpis_instance" FOREIGN KEY ("sla_instance_id") REFERENCES "sla_instances"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sla_instance_kpis" ADD CONSTRAINT "fk_sla_instance_kpis_kpi" FOREIGN KEY ("sla_kpi_id") REFERENCES "sla_kpis"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sla_events" ADD CONSTRAINT "fk_sla_events_incident" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sla_events" ADD CONSTRAINT "fk_sla_events_instance_kpi" FOREIGN KEY ("sla_instance_kpi_id") REFERENCES "sla_instance_kpis"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "service_queues" ADD CONSTRAINT "fk_service_queues_default_policy" FOREIGN KEY ("default_sla_policy_id") REFERENCES "sla_policies"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "service_queue_members" ADD CONSTRAINT "fk_service_queue_members_queue" FOREIGN KEY ("queue_id") REFERENCES "service_queues"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "service_queue_members" ADD CONSTRAINT "fk_service_queue_members_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "customer_assets" ADD CONSTRAINT "fk_customer_assets_company" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "service_subjects" ADD CONSTRAINT "fk_service_subjects_parent" FOREIGN KEY ("parent_id") REFERENCES "service_subjects"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "service_subjects" ADD CONSTRAINT "fk_service_subjects_default_policy" FOREIGN KEY ("default_sla_policy_id") REFERENCES "sla_policies"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "service_calendar_rules" ADD CONSTRAINT "fk_service_calendar_rules_calendar" FOREIGN KEY ("calendar_id") REFERENCES "service_calendars"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "service_calendar_exceptions" ADD CONSTRAINT "fk_service_calendar_exceptions_calendar" FOREIGN KEY ("calendar_id") REFERENCES "service_calendars"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "service_resources" ADD CONSTRAINT "fk_service_resources_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "service_resources" ADD CONSTRAINT "fk_service_resources_calendar" FOREIGN KEY ("calendar_id") REFERENCES "service_calendars"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "service_appointments" ADD CONSTRAINT "fk_service_appointments_resource" FOREIGN KEY ("resource_id") REFERENCES "service_resources"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "service_appointments" ADD CONSTRAINT "fk_service_appointments_incident" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "service_tasks" ADD CONSTRAINT "fk_service_tasks_incident" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "service_tasks" ADD CONSTRAINT "fk_service_tasks_task_type" FOREIGN KEY ("task_type_id") REFERENCES "service_task_types"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "service_tasks" ADD CONSTRAINT "fk_service_tasks_assigned_to" FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "service_tasks" ADD CONSTRAINT "fk_service_tasks_created_by" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

