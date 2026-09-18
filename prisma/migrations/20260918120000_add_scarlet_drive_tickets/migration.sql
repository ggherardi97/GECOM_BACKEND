ALTER TABLE "scarlet_drive_guests"
  ADD COLUMN IF NOT EXISTS "ticket_token" UUID NOT NULL DEFAULT uuid_generate_v4(),
  ADD COLUMN IF NOT EXISTS "checked_in_at" TIMESTAMPTZ(6);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_scarlet_drive_guests_ticket_token"
  ON "scarlet_drive_guests" ("ticket_token");
