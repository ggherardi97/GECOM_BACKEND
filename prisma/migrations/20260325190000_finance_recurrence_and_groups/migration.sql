DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FinancialEntryGroup') THEN
    CREATE TYPE "FinancialEntryGroup" AS ENUM ('FIXED', 'VARIABLE', 'PERSONAL', 'TAX', 'TRANSFER');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FinancialRecurrenceFrequency') THEN
    CREATE TYPE "FinancialRecurrenceFrequency" AS ENUM ('WEEKLY', 'MONTHLY', 'YEARLY');
  END IF;
END $$;

ALTER TABLE "financial_receivables"
  ADD COLUMN IF NOT EXISTS "entry_group" "FinancialEntryGroup" NOT NULL DEFAULT 'VARIABLE',
  ADD COLUMN IF NOT EXISTS "recurrence_enabled" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "recurrence_frequency" "FinancialRecurrenceFrequency" NULL,
  ADD COLUMN IF NOT EXISTS "recurrence_interval" integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "recurrence_day_of_month" integer NULL,
  ADD COLUMN IF NOT EXISTS "recurrence_occurrences" integer NULL,
  ADD COLUMN IF NOT EXISTS "recurrence_end_date" date NULL,
  ADD COLUMN IF NOT EXISTS "recurrence_auto_create" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "recurrence_series_id" uuid NULL,
  ADD COLUMN IF NOT EXISTS "recurrence_parent_id" uuid NULL;

ALTER TABLE "financial_payables"
  ADD COLUMN IF NOT EXISTS "entry_group" "FinancialEntryGroup" NOT NULL DEFAULT 'VARIABLE',
  ADD COLUMN IF NOT EXISTS "recurrence_enabled" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "recurrence_frequency" "FinancialRecurrenceFrequency" NULL,
  ADD COLUMN IF NOT EXISTS "recurrence_interval" integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "recurrence_day_of_month" integer NULL,
  ADD COLUMN IF NOT EXISTS "recurrence_occurrences" integer NULL,
  ADD COLUMN IF NOT EXISTS "recurrence_end_date" date NULL,
  ADD COLUMN IF NOT EXISTS "recurrence_auto_create" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "recurrence_series_id" uuid NULL,
  ADD COLUMN IF NOT EXISTS "recurrence_parent_id" uuid NULL;

CREATE INDEX IF NOT EXISTS "IDX_financial_receivables_tenant_group"
  ON "financial_receivables"("tenant_id", "entry_group");

CREATE INDEX IF NOT EXISTS "IDX_financial_receivables_tenant_series"
  ON "financial_receivables"("tenant_id", "recurrence_series_id");

CREATE INDEX IF NOT EXISTS "IDX_financial_payables_tenant_group"
  ON "financial_payables"("tenant_id", "entry_group");

CREATE INDEX IF NOT EXISTS "IDX_financial_payables_tenant_series"
  ON "financial_payables"("tenant_id", "recurrence_series_id");
