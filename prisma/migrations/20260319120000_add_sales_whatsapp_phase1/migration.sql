DO $$
BEGIN
  ALTER TYPE "lead_source_enum" ADD VALUE 'WHATSAPP';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "whatsapp_integrations" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" uuid NOT NULL,
  "name" varchar(160) NOT NULL,
  "provider" varchar(40) NOT NULL DEFAULT 'IAZAP',
  "api_base_url" text NOT NULL,
  "api_key" text NOT NULL,
  "session_name" varchar(120),
  "phone_number" varchar(50),
  "webhook_token" varchar(80) NOT NULL,
  "webhook_secret" varchar(120),
  "status" varchar(30) NOT NULL DEFAULT 'DRAFT',
  "is_active" boolean NOT NULL DEFAULT true,
  "default_owner_user_id" uuid,
  "default_stage_id" uuid,
  "classifier_prompt" text,
  "auto_reply_prompt" text,
  "fallback_reply_text" text,
  "settings_json" jsonb,
  "last_inbound_at" timestamp(6),
  "last_outbound_at" timestamp(6),
  "last_connection_at" timestamp(6),
  "last_connection_payload" jsonb,
  "created_by_user_id" uuid,
  "updated_by_user_id" uuid,
  "created_at" timestamp(6) NOT NULL DEFAULT now(),
  "updated_at" timestamp(6) NOT NULL DEFAULT now(),
  CONSTRAINT "PK_whatsapp_integrations_id" PRIMARY KEY ("id"),
  CONSTRAINT "uq_whatsapp_integrations_webhook_token" UNIQUE ("webhook_token"),
  CONSTRAINT "uq_whatsapp_integrations_tenant_name" UNIQUE ("tenant_id", "name")
);

CREATE TABLE IF NOT EXISTS "whatsapp_conversations" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" uuid NOT NULL,
  "integration_id" uuid NOT NULL,
  "contact_phone" varchar(50) NOT NULL,
  "contact_phone_normalized" varchar(30) NOT NULL,
  "contact_name" varchar(255),
  "chat_id" varchar(120),
  "last_message_preview" text,
  "first_message_at" timestamp(6) NOT NULL DEFAULT now(),
  "last_message_at" timestamp(6) NOT NULL DEFAULT now(),
  "unread_count" integer NOT NULL DEFAULT 0,
  "status" varchar(30) NOT NULL DEFAULT 'NEW',
  "classification_intent" varchar(40),
  "classification_confidence" numeric(5,2),
  "classification_summary" text,
  "extracted_json" jsonb,
  "lead_id" uuid,
  "lead_created_at" timestamp(6),
  "team_notified_at" timestamp(6),
  "auto_replied_at" timestamp(6),
  "last_classified_at" timestamp(6),
  "created_at" timestamp(6) NOT NULL DEFAULT now(),
  "updated_at" timestamp(6) NOT NULL DEFAULT now(),
  CONSTRAINT "PK_whatsapp_conversations_id" PRIMARY KEY ("id"),
  CONSTRAINT "uq_whatsapp_conversations_phone" UNIQUE ("tenant_id", "integration_id", "contact_phone_normalized")
);

CREATE TABLE IF NOT EXISTS "whatsapp_messages" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" uuid NOT NULL,
  "integration_id" uuid NOT NULL,
  "conversation_id" uuid NOT NULL,
  "external_message_id" varchar(120),
  "direction" varchar(20) NOT NULL,
  "message_type" varchar(40) NOT NULL DEFAULT 'TEXT',
  "body_text" text,
  "media_url" text,
  "sender_phone" varchar(50),
  "recipient_phone" varchar(50),
  "payload_json" jsonb,
  "ai_result_json" jsonb,
  "delivery_status" varchar(30),
  "created_at" timestamp(6) NOT NULL DEFAULT now(),
  CONSTRAINT "PK_whatsapp_messages_id" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "IDX_whatsapp_integrations_tenant_active"
  ON "whatsapp_integrations" ("tenant_id", "is_active");

CREATE INDEX IF NOT EXISTS "IDX_whatsapp_integrations_tenant_owner"
  ON "whatsapp_integrations" ("tenant_id", "default_owner_user_id");

CREATE INDEX IF NOT EXISTS "IDX_whatsapp_conversations_tenant_last_message"
  ON "whatsapp_conversations" ("tenant_id", "integration_id", "last_message_at");

CREATE INDEX IF NOT EXISTS "IDX_whatsapp_conversations_tenant_lead"
  ON "whatsapp_conversations" ("tenant_id", "lead_id");

CREATE INDEX IF NOT EXISTS "IDX_whatsapp_messages_tenant_created"
  ON "whatsapp_messages" ("tenant_id", "integration_id", "created_at");

CREATE INDEX IF NOT EXISTS "IDX_whatsapp_messages_conversation_created"
  ON "whatsapp_messages" ("tenant_id", "conversation_id", "created_at");

CREATE INDEX IF NOT EXISTS "IDX_whatsapp_messages_external"
  ON "whatsapp_messages" ("tenant_id", "integration_id", "external_message_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_whatsapp_integrations_owner'
  ) THEN
    ALTER TABLE "whatsapp_integrations"
      ADD CONSTRAINT "fk_whatsapp_integrations_owner"
      FOREIGN KEY ("default_owner_user_id") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_whatsapp_integrations_stage'
  ) THEN
    ALTER TABLE "whatsapp_integrations"
      ADD CONSTRAINT "fk_whatsapp_integrations_stage"
      FOREIGN KEY ("default_stage_id") REFERENCES "lead_pipeline_stages"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_whatsapp_integrations_created_by'
  ) THEN
    ALTER TABLE "whatsapp_integrations"
      ADD CONSTRAINT "fk_whatsapp_integrations_created_by"
      FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_whatsapp_integrations_updated_by'
  ) THEN
    ALTER TABLE "whatsapp_integrations"
      ADD CONSTRAINT "fk_whatsapp_integrations_updated_by"
      FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_whatsapp_conversations_integration'
  ) THEN
    ALTER TABLE "whatsapp_conversations"
      ADD CONSTRAINT "fk_whatsapp_conversations_integration"
      FOREIGN KEY ("integration_id") REFERENCES "whatsapp_integrations"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_whatsapp_conversations_lead'
  ) THEN
    ALTER TABLE "whatsapp_conversations"
      ADD CONSTRAINT "fk_whatsapp_conversations_lead"
      FOREIGN KEY ("lead_id") REFERENCES "leads"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_whatsapp_messages_integration'
  ) THEN
    ALTER TABLE "whatsapp_messages"
      ADD CONSTRAINT "fk_whatsapp_messages_integration"
      FOREIGN KEY ("integration_id") REFERENCES "whatsapp_integrations"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_whatsapp_messages_conversation'
  ) THEN
    ALTER TABLE "whatsapp_messages"
      ADD CONSTRAINT "fk_whatsapp_messages_conversation"
      FOREIGN KEY ("conversation_id") REFERENCES "whatsapp_conversations"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;
