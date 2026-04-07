ALTER TABLE "whatsapp_conversations"
  ADD COLUMN IF NOT EXISTS "owner_user_id" uuid,
  ADD COLUMN IF NOT EXISTS "claimed_at" timestamp(6),
  ADD COLUMN IF NOT EXISTS "last_replied_at" timestamp(6),
  ADD COLUMN IF NOT EXISTS "last_note_at" timestamp(6),
  ADD COLUMN IF NOT EXISTS "contact_avatar_url" text;

CREATE TABLE IF NOT EXISTS "whatsapp_conversation_notes" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" uuid NOT NULL,
  "conversation_id" uuid NOT NULL,
  "user_id" uuid,
  "note_text" text NOT NULL,
  "created_at" timestamp(6) NOT NULL DEFAULT now(),
  "updated_at" timestamp(6) NOT NULL DEFAULT now(),
  CONSTRAINT "PK_whatsapp_conversation_notes_id" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "IDX_whatsapp_conversations_tenant_owner_status"
  ON "whatsapp_conversations" ("tenant_id", "owner_user_id", "status");

CREATE INDEX IF NOT EXISTS "IDX_whatsapp_conversation_notes_conversation"
  ON "whatsapp_conversation_notes" ("tenant_id", "conversation_id", "created_at");

CREATE INDEX IF NOT EXISTS "IDX_whatsapp_conversation_notes_user"
  ON "whatsapp_conversation_notes" ("tenant_id", "user_id", "created_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_whatsapp_conversations_owner'
  ) THEN
    ALTER TABLE "whatsapp_conversations"
      ADD CONSTRAINT "fk_whatsapp_conversations_owner"
      FOREIGN KEY ("owner_user_id") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_whatsapp_conversation_notes_conversation'
  ) THEN
    ALTER TABLE "whatsapp_conversation_notes"
      ADD CONSTRAINT "fk_whatsapp_conversation_notes_conversation"
      FOREIGN KEY ("conversation_id") REFERENCES "whatsapp_conversations"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_whatsapp_conversation_notes_user'
  ) THEN
    ALTER TABLE "whatsapp_conversation_notes"
      ADD CONSTRAINT "fk_whatsapp_conversation_notes_user"
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;
