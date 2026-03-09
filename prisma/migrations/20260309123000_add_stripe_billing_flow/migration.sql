CREATE TABLE IF NOT EXISTS "billing_stripe_plan_prices" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "plan_id" UUID NOT NULL,
  "currency" VARCHAR(8) NOT NULL DEFAULT 'BRL',
  "stripe_product_id" VARCHAR(120) NOT NULL,
  "stripe_price_id" VARCHAR(120) NOT NULL,
  "unit_amount" DECIMAL(19,4) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PK_billing_stripe_plan_prices_id" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "billing_stripe_customers" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" UUID NOT NULL,
  "stripe_customer_id" VARCHAR(120) NOT NULL,
  "email" VARCHAR(255),
  "company_name" VARCHAR(255),
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PK_billing_stripe_customers_id" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "billing_stripe_subscriptions" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" UUID NOT NULL,
  "tenant_subscription_id" UUID,
  "plan_id" UUID,
  "stripe_plan_price_id" UUID,
  "stripe_customer_id" VARCHAR(120) NOT NULL,
  "stripe_subscription_id" VARCHAR(120) NOT NULL,
  "stripe_price_id" VARCHAR(120),
  "status" VARCHAR(80) NOT NULL,
  "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
  "trial_start_at" TIMESTAMPTZ(6),
  "trial_end_at" TIMESTAMPTZ(6),
  "current_period_start_at" TIMESTAMPTZ(6),
  "current_period_end_at" TIMESTAMPTZ(6),
  "canceled_at" TIMESTAMPTZ(6),
  "metadata_json" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PK_billing_stripe_subscriptions_id" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public_signup_payment_sessions" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" UUID,
  "selected_plan_id" UUID,
  "plan_name" VARCHAR(255) NOT NULL,
  "monthly_amount" DECIMAL(19,4) NOT NULL,
  "currency" VARCHAR(8) NOT NULL DEFAULT 'BRL',
  "trial_days" INTEGER NOT NULL DEFAULT 7,
  "signup_payload_json" JSONB NOT NULL,
  "custom_module_ids_json" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "admin_email" VARCHAR(255) NOT NULL,
  "admin_full_name" VARCHAR(255),
  "company_name" VARCHAR(255),
  "stripe_customer_id" VARCHAR(120) NOT NULL,
  "stripe_setup_intent_id" VARCHAR(120) NOT NULL,
  "stripe_setup_client_secret" TEXT,
  "setup_status" VARCHAR(80) NOT NULL DEFAULT 'requires_confirmation',
  "payment_method_id" VARCHAR(120),
  "stripe_subscription_id" VARCHAR(120),
  "completed_at" TIMESTAMPTZ(6),
  "expires_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PK_public_signup_payment_sessions_id" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "billing_custom_requests" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "subject" VARCHAR(255),
  "message" TEXT NOT NULL,
  "status" VARCHAR(40) NOT NULL DEFAULT 'NEW',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PK_billing_custom_requests_id" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_billing_stripe_plan_prices_plan_currency"
  ON "billing_stripe_plan_prices" ("plan_id", "currency");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_billing_stripe_plan_prices_price"
  ON "billing_stripe_plan_prices" ("stripe_price_id");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_billing_stripe_customers_tenant"
  ON "billing_stripe_customers" ("tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_billing_stripe_customers_customer"
  ON "billing_stripe_customers" ("stripe_customer_id");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_billing_stripe_subscriptions_tenant_subscription"
  ON "billing_stripe_subscriptions" ("tenant_subscription_id")
  WHERE "tenant_subscription_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "uq_billing_stripe_subscriptions_subscription"
  ON "billing_stripe_subscriptions" ("stripe_subscription_id");

CREATE INDEX IF NOT EXISTS "IDX_billing_stripe_plan_prices_plan_id"
  ON "billing_stripe_plan_prices" ("plan_id");
CREATE INDEX IF NOT EXISTS "IDX_billing_stripe_customers_tenant_id"
  ON "billing_stripe_customers" ("tenant_id");
CREATE INDEX IF NOT EXISTS "IDX_billing_stripe_subscriptions_tenant_id"
  ON "billing_stripe_subscriptions" ("tenant_id");
CREATE INDEX IF NOT EXISTS "IDX_billing_stripe_subscriptions_plan_id"
  ON "billing_stripe_subscriptions" ("plan_id");
CREATE INDEX IF NOT EXISTS "IDX_billing_stripe_subscriptions_status"
  ON "billing_stripe_subscriptions" ("status");

CREATE INDEX IF NOT EXISTS "IDX_public_signup_payment_sessions_tenant_id"
  ON "public_signup_payment_sessions" ("tenant_id");
CREATE INDEX IF NOT EXISTS "IDX_public_signup_payment_sessions_plan_id"
  ON "public_signup_payment_sessions" ("selected_plan_id");
CREATE INDEX IF NOT EXISTS "IDX_public_signup_payment_sessions_admin_email"
  ON "public_signup_payment_sessions" ("admin_email");
CREATE INDEX IF NOT EXISTS "IDX_public_signup_payment_sessions_setup_intent"
  ON "public_signup_payment_sessions" ("stripe_setup_intent_id");
CREATE INDEX IF NOT EXISTS "IDX_public_signup_payment_sessions_completed_at"
  ON "public_signup_payment_sessions" ("completed_at");

CREATE INDEX IF NOT EXISTS "IDX_billing_custom_requests_tenant_id"
  ON "billing_custom_requests" ("tenant_id");
CREATE INDEX IF NOT EXISTS "IDX_billing_custom_requests_user_id"
  ON "billing_custom_requests" ("user_id");
CREATE INDEX IF NOT EXISTS "IDX_billing_custom_requests_status"
  ON "billing_custom_requests" ("status");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_billing_stripe_plan_prices_plan_id') THEN
    ALTER TABLE "billing_stripe_plan_prices"
      ADD CONSTRAINT "FK_billing_stripe_plan_prices_plan_id"
      FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_billing_stripe_customers_tenant_id') THEN
    ALTER TABLE "billing_stripe_customers"
      ADD CONSTRAINT "FK_billing_stripe_customers_tenant_id"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_billing_stripe_subscriptions_tenant_id') THEN
    ALTER TABLE "billing_stripe_subscriptions"
      ADD CONSTRAINT "FK_billing_stripe_subscriptions_tenant_id"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_billing_stripe_subscriptions_tenant_subscription_id') THEN
    ALTER TABLE "billing_stripe_subscriptions"
      ADD CONSTRAINT "FK_billing_stripe_subscriptions_tenant_subscription_id"
      FOREIGN KEY ("tenant_subscription_id") REFERENCES "tenant_subscriptions"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_billing_stripe_subscriptions_plan_id') THEN
    ALTER TABLE "billing_stripe_subscriptions"
      ADD CONSTRAINT "FK_billing_stripe_subscriptions_plan_id"
      FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_billing_stripe_subscriptions_plan_price_id') THEN
    ALTER TABLE "billing_stripe_subscriptions"
      ADD CONSTRAINT "FK_billing_stripe_subscriptions_plan_price_id"
      FOREIGN KEY ("stripe_plan_price_id") REFERENCES "billing_stripe_plan_prices"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_billing_stripe_subscriptions_customer_id') THEN
    ALTER TABLE "billing_stripe_subscriptions"
      ADD CONSTRAINT "FK_billing_stripe_subscriptions_customer_id"
      FOREIGN KEY ("stripe_customer_id") REFERENCES "billing_stripe_customers"("stripe_customer_id") ON DELETE RESTRICT ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_public_signup_payment_sessions_tenant_id') THEN
    ALTER TABLE "public_signup_payment_sessions"
      ADD CONSTRAINT "FK_public_signup_payment_sessions_tenant_id"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_public_signup_payment_sessions_plan_id') THEN
    ALTER TABLE "public_signup_payment_sessions"
      ADD CONSTRAINT "FK_public_signup_payment_sessions_plan_id"
      FOREIGN KEY ("selected_plan_id") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_billing_custom_requests_tenant_id') THEN
    ALTER TABLE "billing_custom_requests"
      ADD CONSTRAINT "FK_billing_custom_requests_tenant_id"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_billing_custom_requests_user_id') THEN
    ALTER TABLE "billing_custom_requests"
      ADD CONSTRAINT "FK_billing_custom_requests_user_id"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END
$$;
