ALTER TABLE "whatsapp_conversations"
  ADD COLUMN "marketing_opt_in_status" VARCHAR(30) NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "marketing_opt_in_source" VARCHAR(80),
  ADD COLUMN "marketing_opt_in_at" TIMESTAMP(6),
  ADD COLUMN "marketing_opt_out_at" TIMESTAMP(6),
  ADD COLUMN "last_campaign_at" TIMESTAMP(6);

CREATE TABLE "whatsapp_message_templates" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" UUID NOT NULL,
  "integration_id" UUID,
  "name" VARCHAR(160) NOT NULL,
  "category" VARCHAR(40) NOT NULL DEFAULT 'GENERAL',
  "usage_scope" VARCHAR(20) NOT NULL DEFAULT 'BOTH',
  "message_text" TEXT NOT NULL,
  "variables_json" JSONB,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_by_user_id" UUID,
  "updated_by_user_id" UUID,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pk_whatsapp_message_templates" PRIMARY KEY ("id")
);

CREATE TABLE "whatsapp_campaigns" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" UUID NOT NULL,
  "integration_id" UUID NOT NULL,
  "template_id" UUID,
  "name" VARCHAR(160) NOT NULL,
  "status" VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  "audience_mode" VARCHAR(30) NOT NULL DEFAULT 'MANUAL',
  "message_text" TEXT NOT NULL,
  "filters_json" JSONB,
  "launched_at" TIMESTAMP(6),
  "finished_at" TIMESTAMP(6),
  "last_error" TEXT,
  "recipients_total" INTEGER NOT NULL DEFAULT 0,
  "sent_total" INTEGER NOT NULL DEFAULT 0,
  "failed_total" INTEGER NOT NULL DEFAULT 0,
  "skipped_total" INTEGER NOT NULL DEFAULT 0,
  "created_by_user_id" UUID,
  "updated_by_user_id" UUID,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pk_whatsapp_campaigns" PRIMARY KEY ("id")
);

CREATE TABLE "whatsapp_campaign_recipients" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" UUID NOT NULL,
  "campaign_id" UUID NOT NULL,
  "conversation_id" UUID,
  "lead_id" UUID,
  "phone_number" VARCHAR(50) NOT NULL,
  "phone_number_normalized" VARCHAR(30) NOT NULL,
  "contact_name" VARCHAR(255),
  "company_name" VARCHAR(255),
  "source_label" VARCHAR(120),
  "snapshot_opt_in_status" VARCHAR(30) NOT NULL DEFAULT 'UNKNOWN',
  "send_status" VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  "campaign_message_id" VARCHAR(120),
  "last_error" TEXT,
  "sent_at" TIMESTAMP(6),
  "delivered_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pk_whatsapp_campaign_recipients" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_whatsapp_message_templates_tenant_name"
  ON "whatsapp_message_templates" ("tenant_id", "name");

CREATE INDEX "IDX_whatsapp_message_templates_tenant_integration"
  ON "whatsapp_message_templates" ("tenant_id", "integration_id", "is_active");

CREATE INDEX "IDX_whatsapp_message_templates_tenant_scope"
  ON "whatsapp_message_templates" ("tenant_id", "usage_scope", "is_active");

CREATE INDEX "IDX_whatsapp_campaigns_tenant_integration_status"
  ON "whatsapp_campaigns" ("tenant_id", "integration_id", "status");

CREATE INDEX "IDX_whatsapp_campaigns_tenant_created"
  ON "whatsapp_campaigns" ("tenant_id", "created_at");

CREATE UNIQUE INDEX "uq_whatsapp_campaign_recipients_campaign_phone"
  ON "whatsapp_campaign_recipients" ("campaign_id", "phone_number_normalized");

CREATE INDEX "IDX_whatsapp_campaign_recipients_campaign_status"
  ON "whatsapp_campaign_recipients" ("tenant_id", "campaign_id", "send_status");

CREATE INDEX "IDX_whatsapp_campaign_recipients_conversation"
  ON "whatsapp_campaign_recipients" ("tenant_id", "conversation_id");

ALTER TABLE "whatsapp_message_templates"
  ADD CONSTRAINT "fk_whatsapp_message_templates_integration"
  FOREIGN KEY ("integration_id") REFERENCES "whatsapp_integrations"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "whatsapp_campaigns"
  ADD CONSTRAINT "fk_whatsapp_campaigns_integration"
  FOREIGN KEY ("integration_id") REFERENCES "whatsapp_integrations"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "whatsapp_campaigns"
  ADD CONSTRAINT "fk_whatsapp_campaigns_template"
  FOREIGN KEY ("template_id") REFERENCES "whatsapp_message_templates"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "whatsapp_campaign_recipients"
  ADD CONSTRAINT "fk_whatsapp_campaign_recipients_campaign"
  FOREIGN KEY ("campaign_id") REFERENCES "whatsapp_campaigns"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "whatsapp_campaign_recipients"
  ADD CONSTRAINT "fk_whatsapp_campaign_recipients_conversation"
  FOREIGN KEY ("conversation_id") REFERENCES "whatsapp_conversations"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;
