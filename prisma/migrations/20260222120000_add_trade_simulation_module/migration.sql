CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TradeSimulationType') THEN
    CREATE TYPE "TradeSimulationType" AS ENUM ('IMPORT', 'EXPORT');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TradeSimulationStatus') THEN
    CREATE TYPE "TradeSimulationStatus" AS ENUM ('DRAFT', 'FINAL', 'CONVERTED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TradeSimulationCalculationMode') THEN
    CREATE TYPE "TradeSimulationCalculationMode" AS ENUM ('MANUAL', 'RULES', 'TTCE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TradeSimulationCostType') THEN
    CREATE TYPE "TradeSimulationCostType" AS ENUM ('BROKER', 'WAREHOUSE', 'THC', 'INLAND_FREIGHT', 'PORT_FEES', 'OTHER');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TradeSimulationCostAllocationMethod') THEN
    CREATE TYPE "TradeSimulationCostAllocationMethod" AS ENUM ('TOTAL', 'BY_VALUE', 'MANUAL');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TradeSimulationTaxType') THEN
    CREATE TYPE "TradeSimulationTaxType" AS ENUM ('II', 'IPI', 'PIS', 'COFINS', 'ICMS', 'SISCOMEX', 'AFRMM', 'ANTIDUMPING', 'OTHER');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NcmTaxRuleSource') THEN
    CREATE TYPE "NcmTaxRuleSource" AS ENUM ('MANUAL', 'IMPORT', 'API');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "trade_simulations" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "type" "TradeSimulationType" NOT NULL,
  "status" "TradeSimulationStatus" NOT NULL DEFAULT 'DRAFT',
  "calculation_mode" "TradeSimulationCalculationMode" NOT NULL DEFAULT 'MANUAL',
  "currency" VARCHAR(3) NOT NULL,
  "exchange_rate" DECIMAL(19,8),
  "incoterm" VARCHAR(20),
  "origin_country" VARCHAR(2),
  "destination_state" VARCHAR(2),
  "customs_value" DECIMAL(19,4) NOT NULL,
  "freight_international" DECIMAL(19,4),
  "insurance_international" DECIMAL(19,4),
  "other_additions" DECIMAL(19,4),
  "icms_rate" DECIMAL(9,6),
  "calculation_payload_json" JSONB,
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PK_trade_simulations" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "trade_simulation_items" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" UUID NOT NULL,
  "trade_simulation_id" UUID NOT NULL,
  "product_id" UUID,
  "description" VARCHAR(255) NOT NULL,
  "ncm" VARCHAR(20) NOT NULL,
  "quantity" DECIMAL(19,6) NOT NULL,
  "unit_price" DECIMAL(19,6) NOT NULL,
  "item_value" DECIMAL(19,4) NOT NULL,
  "freight_allocated" DECIMAL(19,4),
  "insurance_allocated" DECIMAL(19,4),
  "customs_value_allocated" DECIMAL(19,4),
  "notes" VARCHAR(500),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PK_trade_simulation_items" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "trade_simulation_costs" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" UUID NOT NULL,
  "trade_simulation_id" UUID NOT NULL,
  "cost_type" "TradeSimulationCostType" NOT NULL,
  "amount" DECIMAL(19,4) NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "exchange_rate" DECIMAL(19,8),
  "is_in_icms_base" BOOLEAN NOT NULL DEFAULT true,
  "allocation_method" "TradeSimulationCostAllocationMethod" NOT NULL DEFAULT 'TOTAL',
  "notes" VARCHAR(500),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PK_trade_simulation_costs" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "trade_simulation_taxes" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" UUID NOT NULL,
  "trade_simulation_id" UUID NOT NULL,
  "trade_simulation_item_id" UUID,
  "tax_type" "TradeSimulationTaxType" NOT NULL,
  "base_amount_brl" DECIMAL(19,4),
  "rate" DECIMAL(9,6),
  "amount_brl" DECIMAL(19,4) NOT NULL,
  "metadata_json" JSONB,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PK_trade_simulation_taxes" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "tax_profiles" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "type" "TradeSimulationType" NOT NULL,
  "destination_state" VARCHAR(2),
  "icms_rate" DECIMAL(9,6),
  "include_ipi_in_icms_base" BOOLEAN NOT NULL DEFAULT true,
  "include_pis_cofins_in_icms_base" BOOLEAN NOT NULL DEFAULT true,
  "default_costs_json" JSONB,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PK_tax_profiles" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ncm_tax_rules" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" UUID NOT NULL,
  "ncm" VARCHAR(20) NOT NULL,
  "ii_rate" DECIMAL(9,6),
  "ipi_rate" DECIMAL(9,6),
  "pis_rate" DECIMAL(9,6),
  "cofins_rate" DECIMAL(9,6),
  "valid_from" TIMESTAMP(6),
  "valid_to" TIMESTAMP(6),
  "source" "NcmTaxRuleSource" NOT NULL DEFAULT 'MANUAL',
  "notes" VARCHAR(500),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PK_ncm_tax_rules" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_trade_simulations_company') THEN
    ALTER TABLE "trade_simulations"
      ADD CONSTRAINT "fk_trade_simulations_company"
      FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_trade_simulations_created_by_user') THEN
    ALTER TABLE "trade_simulations"
      ADD CONSTRAINT "fk_trade_simulations_created_by_user"
      FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_trade_simulation_items_simulation') THEN
    ALTER TABLE "trade_simulation_items"
      ADD CONSTRAINT "fk_trade_simulation_items_simulation"
      FOREIGN KEY ("trade_simulation_id") REFERENCES "trade_simulations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_trade_simulation_items_product') THEN
    ALTER TABLE "trade_simulation_items"
      ADD CONSTRAINT "fk_trade_simulation_items_product"
      FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_trade_simulation_costs_simulation') THEN
    ALTER TABLE "trade_simulation_costs"
      ADD CONSTRAINT "fk_trade_simulation_costs_simulation"
      FOREIGN KEY ("trade_simulation_id") REFERENCES "trade_simulations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_trade_simulation_taxes_simulation') THEN
    ALTER TABLE "trade_simulation_taxes"
      ADD CONSTRAINT "fk_trade_simulation_taxes_simulation"
      FOREIGN KEY ("trade_simulation_id") REFERENCES "trade_simulations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_trade_simulation_taxes_item') THEN
    ALTER TABLE "trade_simulation_taxes"
      ADD CONSTRAINT "fk_trade_simulation_taxes_item"
      FOREIGN KEY ("trade_simulation_item_id") REFERENCES "trade_simulation_items"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "IDX_trade_simulations_tenant_id" ON "trade_simulations"("tenant_id");
CREATE INDEX IF NOT EXISTS "IDX_trade_simulations_tenant_company" ON "trade_simulations"("tenant_id", "company_id");
CREATE INDEX IF NOT EXISTS "IDX_trade_simulations_tenant_status" ON "trade_simulations"("tenant_id", "status");

CREATE INDEX IF NOT EXISTS "IDX_trade_simulation_items_tenant_id" ON "trade_simulation_items"("tenant_id");
CREATE INDEX IF NOT EXISTS "IDX_trade_simulation_items_tenant_simulation" ON "trade_simulation_items"("tenant_id", "trade_simulation_id");
CREATE INDEX IF NOT EXISTS "IDX_trade_simulation_items_tenant_ncm" ON "trade_simulation_items"("tenant_id", "ncm");

CREATE INDEX IF NOT EXISTS "IDX_trade_simulation_costs_tenant_id" ON "trade_simulation_costs"("tenant_id");
CREATE INDEX IF NOT EXISTS "IDX_trade_simulation_costs_tenant_simulation" ON "trade_simulation_costs"("tenant_id", "trade_simulation_id");

CREATE INDEX IF NOT EXISTS "IDX_trade_simulation_taxes_tenant_id" ON "trade_simulation_taxes"("tenant_id");
CREATE INDEX IF NOT EXISTS "IDX_trade_simulation_taxes_tenant_simulation" ON "trade_simulation_taxes"("tenant_id", "trade_simulation_id");

CREATE INDEX IF NOT EXISTS "IDX_tax_profiles_tenant_id" ON "tax_profiles"("tenant_id");
CREATE INDEX IF NOT EXISTS "IDX_tax_profiles_tenant_type" ON "tax_profiles"("tenant_id", "type");

CREATE INDEX IF NOT EXISTS "IDX_ncm_tax_rules_tenant_id" ON "ncm_tax_rules"("tenant_id");
CREATE INDEX IF NOT EXISTS "IDX_ncm_tax_rules_tenant_ncm" ON "ncm_tax_rules"("tenant_id", "ncm");

