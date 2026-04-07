DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FinancialImportSourceType') THEN
    CREATE TYPE "FinancialImportSourceType" AS ENUM ('OFX', 'CSV', 'PDF');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FinancialImportJobStatus') THEN
    CREATE TYPE "FinancialImportJobStatus" AS ENUM ('REVIEW', 'APPLIED', 'FAILED');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FinancialImportSuggestionKind') THEN
    CREATE TYPE "FinancialImportSuggestionKind" AS ENUM (
      'CREATE_MOVEMENT',
      'MATCH_RECEIVABLE_PAYMENT',
      'MATCH_PAYABLE_PAYMENT',
      'CREATE_RECEIVABLE',
      'CREATE_PAYABLE',
      'TRANSFER',
      'IGNORE'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FinancialImportSuggestionStatus') THEN
    CREATE TYPE "FinancialImportSuggestionStatus" AS ENUM ('SUGGESTED', 'APPROVED', 'APPLIED', 'IGNORED', 'ERROR');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "financial_import_jobs" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" uuid NOT NULL,
  "bank_account_id" uuid NULL,
  "source_type" "FinancialImportSourceType" NOT NULL,
  "source_name" varchar(255) NOT NULL,
  "mime_type" varchar(120) NULL,
  "file_size" integer NULL,
  "status" "FinancialImportJobStatus" NOT NULL DEFAULT 'REVIEW',
  "parsed_summary" jsonb NULL,
  "parser_warnings" jsonb NULL,
  "ai_summary" jsonb NULL,
  "lines_total" integer NOT NULL DEFAULT 0,
  "lines_reviewed" integer NOT NULL DEFAULT 0,
  "lines_applied" integer NOT NULL DEFAULT 0,
  "lines_ignored" integer NOT NULL DEFAULT 0,
  "uploaded_by" uuid NULL,
  "applied_by" uuid NULL,
  "uploaded_at" timestamp(6) NOT NULL DEFAULT now(),
  "analyzed_at" timestamp(6) NULL,
  "applied_at" timestamp(6) NULL,
  "created_at" timestamp(6) NOT NULL DEFAULT now(),
  "updated_at" timestamp(6) NOT NULL DEFAULT now(),
  CONSTRAINT "PK_financial_import_jobs" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "financial_import_lines" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" uuid NOT NULL,
  "import_job_id" uuid NOT NULL,
  "line_number" integer NOT NULL,
  "external_id" varchar(120) NULL,
  "transaction_date" date NULL,
  "movement_type" "FinancialMovementType" NULL,
  "amount" numeric(19,4) NOT NULL DEFAULT 0,
  "balance_after" numeric(19,4) NULL,
  "currency_code" varchar(10) NULL,
  "description" text NULL,
  "counterparty_name" varchar(150) NULL,
  "document_number" varchar(120) NULL,
  "source_payload" jsonb NULL,
  "raw_text" text NULL,
  "normalized_text" text NULL,
  "suggestion_kind" "FinancialImportSuggestionKind" NOT NULL DEFAULT 'CREATE_MOVEMENT',
  "suggestion_status" "FinancialImportSuggestionStatus" NOT NULL DEFAULT 'SUGGESTED',
  "confidence_score" numeric(5,2) NOT NULL DEFAULT 0,
  "rule_code" varchar(80) NULL,
  "ai_reasoning" text NULL,
  "approved_action" jsonb NULL,
  "review_note" text NULL,
  "suggested_category_id" uuid NULL,
  "suggested_cost_center_id" uuid NULL,
  "suggested_company_id" uuid NULL,
  "matched_bank_movement_id" uuid NULL,
  "matched_receivable_id" uuid NULL,
  "matched_payable_id" uuid NULL,
  "matched_receivable_payment_id" uuid NULL,
  "matched_payable_payment_id" uuid NULL,
  "generated_bank_movement_id" uuid NULL,
  "generated_receivable_id" uuid NULL,
  "generated_payable_id" uuid NULL,
  "generated_receivable_payment_id" uuid NULL,
  "generated_payable_payment_id" uuid NULL,
  "applied_at" timestamp(6) NULL,
  "created_at" timestamp(6) NOT NULL DEFAULT now(),
  "updated_at" timestamp(6) NOT NULL DEFAULT now(),
  CONSTRAINT "PK_financial_import_lines" PRIMARY KEY ("id")
);

ALTER TABLE "financial_import_jobs"
  ADD CONSTRAINT "fk_financial_import_jobs_bank_account"
  FOREIGN KEY ("bank_account_id")
  REFERENCES "financial_bank_accounts"("id")
  ON DELETE SET NULL
  ON UPDATE NO ACTION;

ALTER TABLE "financial_import_lines"
  ADD CONSTRAINT "fk_financial_import_lines_job"
  FOREIGN KEY ("import_job_id")
  REFERENCES "financial_import_jobs"("id")
  ON DELETE CASCADE
  ON UPDATE NO ACTION;

ALTER TABLE "financial_import_lines"
  ADD CONSTRAINT "fk_financial_import_lines_category"
  FOREIGN KEY ("suggested_category_id")
  REFERENCES "financial_categories"("id")
  ON DELETE SET NULL
  ON UPDATE NO ACTION;

ALTER TABLE "financial_import_lines"
  ADD CONSTRAINT "fk_financial_import_lines_cost_center"
  FOREIGN KEY ("suggested_cost_center_id")
  REFERENCES "financial_cost_centers"("id")
  ON DELETE SET NULL
  ON UPDATE NO ACTION;

ALTER TABLE "financial_import_lines"
  ADD CONSTRAINT "fk_financial_import_lines_company"
  FOREIGN KEY ("suggested_company_id")
  REFERENCES "companies"("id")
  ON DELETE SET NULL
  ON UPDATE NO ACTION;

CREATE INDEX IF NOT EXISTS "IDX_financial_import_jobs_tenant_id"
  ON "financial_import_jobs"("tenant_id");

CREATE INDEX IF NOT EXISTS "IDX_financial_import_jobs_tenant_status"
  ON "financial_import_jobs"("tenant_id", "status");

CREATE INDEX IF NOT EXISTS "IDX_financial_import_jobs_tenant_account"
  ON "financial_import_jobs"("tenant_id", "bank_account_id");

CREATE INDEX IF NOT EXISTS "IDX_financial_import_jobs_tenant_uploaded"
  ON "financial_import_jobs"("tenant_id", "uploaded_at");

CREATE INDEX IF NOT EXISTS "IDX_financial_import_lines_tenant_id"
  ON "financial_import_lines"("tenant_id");

CREATE INDEX IF NOT EXISTS "IDX_financial_import_lines_tenant_job"
  ON "financial_import_lines"("tenant_id", "import_job_id");

CREATE INDEX IF NOT EXISTS "IDX_financial_import_lines_tenant_status"
  ON "financial_import_lines"("tenant_id", "suggestion_status");

CREATE INDEX IF NOT EXISTS "IDX_financial_import_lines_tenant_date"
  ON "financial_import_lines"("tenant_id", "transaction_date");
