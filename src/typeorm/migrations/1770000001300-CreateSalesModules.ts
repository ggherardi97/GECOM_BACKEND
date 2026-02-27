import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSalesModules1770000001300 implements MigrationInterface {
  name = 'CreateSalesModules1770000001300';

  private sqlLiteral(value: string): string {
    return String(value).replace(/'/g, "''");
  }

  private sqlIdentifier(value: string): string {
    return String(value).replace(/"/g, '""');
  }

  private async enumExists(queryRunner: QueryRunner, enumName: string): Promise<boolean> {
    const result = await queryRunner.query(
      `
      SELECT 1
      FROM pg_type
      WHERE typname = $1
      LIMIT 1
      `,
      [enumName],
    );
    return result.length > 0;
  }

  private async ensureEnum(queryRunner: QueryRunner, enumName: string, values: string[]): Promise<void> {
    if (!(await this.enumExists(queryRunner, enumName))) {
      const enumValues = values.map((value) => `'${value.replace(/'/g, "''")}'`).join(', ');
      await queryRunner.query(`CREATE TYPE "${enumName}" AS ENUM (${enumValues})`);
      return;
    }

    for (const value of values) {
      const enumNameLiteral = this.sqlLiteral(enumName);
      const enumValueLiteral = this.sqlLiteral(value);
      const enumNameIdentifier = this.sqlIdentifier(enumName);
      await queryRunner.query(
        `
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1
            FROM pg_type t
            WHERE t.typname = '${enumNameLiteral}'
          ) AND NOT EXISTS (
            SELECT 1
            FROM pg_type t
            JOIN pg_enum e ON e.enumtypid = t.oid
            WHERE t.typname = '${enumNameLiteral}'
              AND e.enumlabel = '${enumValueLiteral}'
          ) THEN
            EXECUTE 'ALTER TYPE "${enumNameIdentifier}" ADD VALUE ''${enumValueLiteral}''';
          END IF;
        END $$;
        `,
      );
    }
  }

  private async ensureConstraint(
    queryRunner: QueryRunner,
    constraintName: string,
    sql: string,
  ): Promise<void> {
    await queryRunner.query(
      `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = '${constraintName}'
        ) THEN
          ${sql}
        END IF;
      END $$;
      `,
    );
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.ensureEnum(queryRunner, 'OpportunityStatus', ['OPEN', 'PROPOSAL', 'WON', 'LOST', 'CANCELLED']);
    await this.ensureEnum(queryRunner, 'SalesApprovalEntity', [
      'OPPORTUNITY',
      'INVOICE',
      'CONTRACT',
      'PRICE_TABLE',
      'OTHER',
    ]);
    await this.ensureEnum(queryRunner, 'SalesApprovalStatus', ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']);
    await this.ensureEnum(queryRunner, 'GoalPeriodType', ['MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM']);
    await this.ensureEnum(queryRunner, 'SalesCommissionSource', [
      'OPPORTUNITY',
      'INVOICE',
      'CONTRACT',
      'MANUAL',
    ]);
    await this.ensureEnum(queryRunner, 'SalesCommissionStatus', [
      'PENDING',
      'APPROVED',
      'PAID',
      'CANCELLED',
    ]);
    await this.ensureEnum(queryRunner, 'ContractStatus', ['DRAFT', 'ACTIVE', 'SUSPENDED', 'CANCELLED', 'EXPIRED']);
    await this.ensureEnum(queryRunner, 'ContractBillingFrequency', [
      'MONTHLY',
      'QUARTERLY',
      'YEARLY',
      'ONE_TIME',
    ]);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "opportunities" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "name" character varying(255) NOT NULL,
        "description" text,
        "status" "OpportunityStatus" NOT NULL DEFAULT 'OPEN',
        "company_id" uuid,
        "lead_id" uuid,
        "owner_user_id" uuid NOT NULL,
        "currency_id" uuid,
        "expected_close_at" timestamp(6),
        "probability_percent" integer NOT NULL DEFAULT 0,
        "subtotal" numeric(19,4) NOT NULL DEFAULT 0,
        "discount_percent" integer NOT NULL DEFAULT 0,
        "discount_amount" numeric(19,4) NOT NULL DEFAULT 0,
        "tax_total" numeric(19,4) NOT NULL DEFAULT 0,
        "total" numeric(19,4) NOT NULL DEFAULT 0,
        "converted_invoice_id" uuid,
        "converted_at" timestamp(6),
        "created_at" timestamp(6) NOT NULL DEFAULT now(),
        "updated_at" timestamp(6) NOT NULL DEFAULT now(),
        CONSTRAINT "PK_opportunities" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_opportunities_tenant_id" ON "opportunities" ("tenant_id")`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_opportunities_tenant_status" ON "opportunities" ("tenant_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_opportunities_tenant_company" ON "opportunities" ("tenant_id", "company_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_opportunities_tenant_lead" ON "opportunities" ("tenant_id", "lead_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_opportunities_tenant_owner" ON "opportunities" ("tenant_id", "owner_user_id")`,
    );

    await this.ensureConstraint(
      queryRunner,
      'fk_opportunities_company',
      'ALTER TABLE "opportunities" ADD CONSTRAINT "fk_opportunities_company" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE NO ACTION;',
    );
    await this.ensureConstraint(
      queryRunner,
      'fk_opportunities_lead',
      'ALTER TABLE "opportunities" ADD CONSTRAINT "fk_opportunities_lead" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE NO ACTION;',
    );
    await this.ensureConstraint(
      queryRunner,
      'fk_opportunities_owner_user',
      'ALTER TABLE "opportunities" ADD CONSTRAINT "fk_opportunities_owner_user" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;',
    );
    await this.ensureConstraint(
      queryRunner,
      'fk_opportunities_currency',
      'ALTER TABLE "opportunities" ADD CONSTRAINT "fk_opportunities_currency" FOREIGN KEY ("currency_id") REFERENCES "currencies"("id") ON DELETE SET NULL ON UPDATE NO ACTION;',
    );
    await this.ensureConstraint(
      queryRunner,
      'fk_opportunities_converted_invoice',
      'ALTER TABLE "opportunities" ADD CONSTRAINT "fk_opportunities_converted_invoice" FOREIGN KEY ("converted_invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE NO ACTION;',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "opportunity_lines" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "opportunity_id" uuid NOT NULL,
        "line_number" integer NOT NULL,
        "product_id" uuid,
        "description" text,
        "unit" character varying(50),
        "unit_price" numeric(19,4) NOT NULL DEFAULT 0,
        "quantity" numeric(19,4) NOT NULL DEFAULT 1,
        "tax_rate" numeric(9,4) NOT NULL DEFAULT 0,
        "tax_amount" numeric(19,4) NOT NULL DEFAULT 0,
        "discount_percent" integer NOT NULL DEFAULT 0,
        "discount_amount" numeric(19,4) NOT NULL DEFAULT 0,
        "line_subtotal" numeric(19,4) NOT NULL DEFAULT 0,
        "line_total" numeric(19,4) NOT NULL DEFAULT 0,
        "created_at" timestamp(6) NOT NULL DEFAULT now(),
        "updated_at" timestamp(6) NOT NULL DEFAULT now(),
        CONSTRAINT "PK_opportunity_lines" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_opportunity_lines_tenant_opportunity_line" ON "opportunity_lines" ("tenant_id", "opportunity_id", "line_number")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_opportunity_lines_tenant_id" ON "opportunity_lines" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_opportunity_lines_tenant_opportunity" ON "opportunity_lines" ("tenant_id", "opportunity_id")`,
    );

    await this.ensureConstraint(
      queryRunner,
      'fk_opportunity_lines_opportunity',
      'ALTER TABLE "opportunity_lines" ADD CONSTRAINT "fk_opportunity_lines_opportunity" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE NO ACTION;',
    );
    await this.ensureConstraint(
      queryRunner,
      'fk_opportunity_lines_product',
      'ALTER TABLE "opportunity_lines" ADD CONSTRAINT "fk_opportunity_lines_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE NO ACTION;',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sales_approvals" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "entity_type" "SalesApprovalEntity" NOT NULL,
        "entity_id" uuid NOT NULL,
        "opportunity_id" uuid,
        "status" "SalesApprovalStatus" NOT NULL DEFAULT 'PENDING',
        "title" character varying(255) NOT NULL,
        "description" text,
        "amount" numeric(19,4),
        "requested_by_user_id" uuid NOT NULL,
        "requested_at" timestamp(6) NOT NULL DEFAULT now(),
        "resolved_by_user_id" uuid,
        "resolved_at" timestamp(6),
        "resolution_note" text,
        "created_at" timestamp(6) NOT NULL DEFAULT now(),
        "updated_at" timestamp(6) NOT NULL DEFAULT now(),
        CONSTRAINT "PK_sales_approvals" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_sales_approvals_tenant_id" ON "sales_approvals" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_sales_approvals_tenant_status" ON "sales_approvals" ("tenant_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_sales_approvals_tenant_entity" ON "sales_approvals" ("tenant_id", "entity_type", "entity_id")`,
    );

    await this.ensureConstraint(
      queryRunner,
      'fk_sales_approvals_opportunity',
      'ALTER TABLE "sales_approvals" ADD CONSTRAINT "fk_sales_approvals_opportunity" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE NO ACTION;',
    );
    await this.ensureConstraint(
      queryRunner,
      'fk_sales_approvals_requested_by',
      'ALTER TABLE "sales_approvals" ADD CONSTRAINT "fk_sales_approvals_requested_by" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;',
    );
    await this.ensureConstraint(
      queryRunner,
      'fk_sales_approvals_resolved_by',
      'ALTER TABLE "sales_approvals" ADD CONSTRAINT "fk_sales_approvals_resolved_by" FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "price_tables" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "name" character varying(150) NOT NULL,
        "description" text,
        "currency_id" uuid,
        "is_default" boolean NOT NULL DEFAULT false,
        "is_active" boolean NOT NULL DEFAULT true,
        "valid_from" date,
        "valid_to" date,
        "created_at" timestamp(6) NOT NULL DEFAULT now(),
        "updated_at" timestamp(6) NOT NULL DEFAULT now(),
        CONSTRAINT "PK_price_tables" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_price_tables_tenant_name" ON "price_tables" ("tenant_id", "name")`,
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_price_tables_tenant_id" ON "price_tables" ("tenant_id")`);

    await this.ensureConstraint(
      queryRunner,
      'fk_price_tables_currency',
      'ALTER TABLE "price_tables" ADD CONSTRAINT "fk_price_tables_currency" FOREIGN KEY ("currency_id") REFERENCES "currencies"("id") ON DELETE SET NULL ON UPDATE NO ACTION;',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "price_table_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "price_table_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "min_quantity" numeric(19,4) NOT NULL DEFAULT 1,
        "max_quantity" numeric(19,4),
        "unit_price" numeric(19,4) NOT NULL DEFAULT 0,
        "discount_percent" integer NOT NULL DEFAULT 0,
        "notes" text,
        "created_at" timestamp(6) NOT NULL DEFAULT now(),
        "updated_at" timestamp(6) NOT NULL DEFAULT now(),
        CONSTRAINT "PK_price_table_items" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_price_table_items_tenant_table_product_minq" ON "price_table_items" ("tenant_id", "price_table_id", "product_id", "min_quantity")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_price_table_items_tenant_id" ON "price_table_items" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_price_table_items_tenant_table" ON "price_table_items" ("tenant_id", "price_table_id")`,
    );

    await this.ensureConstraint(
      queryRunner,
      'fk_price_table_items_table',
      'ALTER TABLE "price_table_items" ADD CONSTRAINT "fk_price_table_items_table" FOREIGN KEY ("price_table_id") REFERENCES "price_tables"("id") ON DELETE CASCADE ON UPDATE NO ACTION;',
    );
    await this.ensureConstraint(
      queryRunner,
      'fk_price_table_items_product',
      'ALTER TABLE "price_table_items" ADD CONSTRAINT "fk_price_table_items_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sales_goals" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "owner_user_id" uuid NOT NULL,
        "period_type" "GoalPeriodType" NOT NULL,
        "period_start" date NOT NULL,
        "period_end" date NOT NULL,
        "target_amount" numeric(19,4) NOT NULL DEFAULT 0,
        "achieved_amount" numeric(19,4) NOT NULL DEFAULT 0,
        "commission_percent" numeric(9,4) NOT NULL DEFAULT 0,
        "currency_id" uuid,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamp(6) NOT NULL DEFAULT now(),
        "updated_at" timestamp(6) NOT NULL DEFAULT now(),
        CONSTRAINT "PK_sales_goals" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_sales_goals_tenant_owner_period" ON "sales_goals" ("tenant_id", "owner_user_id", "period_type", "period_start", "period_end")`,
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_sales_goals_tenant_id" ON "sales_goals" ("tenant_id")`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_sales_goals_tenant_owner" ON "sales_goals" ("tenant_id", "owner_user_id")`,
    );

    await this.ensureConstraint(
      queryRunner,
      'fk_sales_goals_owner',
      'ALTER TABLE "sales_goals" ADD CONSTRAINT "fk_sales_goals_owner" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;',
    );
    await this.ensureConstraint(
      queryRunner,
      'fk_sales_goals_currency',
      'ALTER TABLE "sales_goals" ADD CONSTRAINT "fk_sales_goals_currency" FOREIGN KEY ("currency_id") REFERENCES "currencies"("id") ON DELETE SET NULL ON UPDATE NO ACTION;',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sales_commissions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "sales_goal_id" uuid,
        "owner_user_id" uuid NOT NULL,
        "source_type" "SalesCommissionSource" NOT NULL DEFAULT 'MANUAL',
        "source_id" uuid,
        "base_amount" numeric(19,4) NOT NULL DEFAULT 0,
        "percent" numeric(9,4) NOT NULL DEFAULT 0,
        "amount" numeric(19,4) NOT NULL DEFAULT 0,
        "status" "SalesCommissionStatus" NOT NULL DEFAULT 'PENDING',
        "due_at" date,
        "paid_at" timestamp(6),
        "notes" text,
        "created_at" timestamp(6) NOT NULL DEFAULT now(),
        "updated_at" timestamp(6) NOT NULL DEFAULT now(),
        CONSTRAINT "PK_sales_commissions" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_sales_commissions_tenant_id" ON "sales_commissions" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_sales_commissions_tenant_owner" ON "sales_commissions" ("tenant_id", "owner_user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_sales_commissions_tenant_status" ON "sales_commissions" ("tenant_id", "status")`,
    );

    await this.ensureConstraint(
      queryRunner,
      'fk_sales_commissions_goal',
      'ALTER TABLE "sales_commissions" ADD CONSTRAINT "fk_sales_commissions_goal" FOREIGN KEY ("sales_goal_id") REFERENCES "sales_goals"("id") ON DELETE SET NULL ON UPDATE NO ACTION;',
    );
    await this.ensureConstraint(
      queryRunner,
      'fk_sales_commissions_owner',
      'ALTER TABLE "sales_commissions" ADD CONSTRAINT "fk_sales_commissions_owner" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "contracts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "contract_number" character varying(50) NOT NULL,
        "name" character varying(255) NOT NULL,
        "company_id" uuid NOT NULL,
        "lead_id" uuid,
        "opportunity_id" uuid,
        "owner_user_id" uuid NOT NULL,
        "currency_id" uuid NOT NULL,
        "price_table_id" uuid,
        "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
        "start_at" date,
        "end_at" date,
        "renewal_date" date,
        "billing_day" integer,
        "auto_renew" boolean NOT NULL DEFAULT false,
        "subtotal" numeric(19,4) NOT NULL DEFAULT 0,
        "discount_percent" integer NOT NULL DEFAULT 0,
        "discount_amount" numeric(19,4) NOT NULL DEFAULT 0,
        "tax_total" numeric(19,4) NOT NULL DEFAULT 0,
        "total" numeric(19,4) NOT NULL DEFAULT 0,
        "terms" text,
        "notes" text,
        "created_at" timestamp(6) NOT NULL DEFAULT now(),
        "updated_at" timestamp(6) NOT NULL DEFAULT now(),
        CONSTRAINT "PK_contracts" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_contracts_tenant_number" ON "contracts" ("tenant_id", "contract_number")`,
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_contracts_tenant_id" ON "contracts" ("tenant_id")`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_contracts_tenant_company" ON "contracts" ("tenant_id", "company_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_contracts_tenant_status" ON "contracts" ("tenant_id", "status")`,
    );

    await this.ensureConstraint(
      queryRunner,
      'fk_contracts_company',
      'ALTER TABLE "contracts" ADD CONSTRAINT "fk_contracts_company" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;',
    );
    await this.ensureConstraint(
      queryRunner,
      'fk_contracts_lead',
      'ALTER TABLE "contracts" ADD CONSTRAINT "fk_contracts_lead" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE NO ACTION;',
    );
    await this.ensureConstraint(
      queryRunner,
      'fk_contracts_opportunity',
      'ALTER TABLE "contracts" ADD CONSTRAINT "fk_contracts_opportunity" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE NO ACTION;',
    );
    await this.ensureConstraint(
      queryRunner,
      'fk_contracts_owner',
      'ALTER TABLE "contracts" ADD CONSTRAINT "fk_contracts_owner" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;',
    );
    await this.ensureConstraint(
      queryRunner,
      'fk_contracts_currency',
      'ALTER TABLE "contracts" ADD CONSTRAINT "fk_contracts_currency" FOREIGN KEY ("currency_id") REFERENCES "currencies"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;',
    );
    await this.ensureConstraint(
      queryRunner,
      'fk_contracts_price_table',
      'ALTER TABLE "contracts" ADD CONSTRAINT "fk_contracts_price_table" FOREIGN KEY ("price_table_id") REFERENCES "price_tables"("id") ON DELETE SET NULL ON UPDATE NO ACTION;',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "contract_lines" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "contract_id" uuid NOT NULL,
        "line_number" integer NOT NULL,
        "product_id" uuid,
        "description" text,
        "unit" character varying(50),
        "unit_price" numeric(19,4) NOT NULL DEFAULT 0,
        "quantity" numeric(19,4) NOT NULL DEFAULT 1,
        "tax_rate" numeric(9,4) NOT NULL DEFAULT 0,
        "tax_amount" numeric(19,4) NOT NULL DEFAULT 0,
        "discount_percent" integer NOT NULL DEFAULT 0,
        "discount_amount" numeric(19,4) NOT NULL DEFAULT 0,
        "line_subtotal" numeric(19,4) NOT NULL DEFAULT 0,
        "line_total" numeric(19,4) NOT NULL DEFAULT 0,
        "start_at" date,
        "end_at" date,
        "billing_frequency" "ContractBillingFrequency" NOT NULL DEFAULT 'MONTHLY',
        "is_recurring" boolean NOT NULL DEFAULT true,
        "created_at" timestamp(6) NOT NULL DEFAULT now(),
        "updated_at" timestamp(6) NOT NULL DEFAULT now(),
        CONSTRAINT "PK_contract_lines" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_contract_lines_tenant_contract_line" ON "contract_lines" ("tenant_id", "contract_id", "line_number")`,
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_contract_lines_tenant_id" ON "contract_lines" ("tenant_id")`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_contract_lines_tenant_contract" ON "contract_lines" ("tenant_id", "contract_id")`,
    );

    await this.ensureConstraint(
      queryRunner,
      'fk_contract_lines_contract',
      'ALTER TABLE "contract_lines" ADD CONSTRAINT "fk_contract_lines_contract" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE NO ACTION;',
    );
    await this.ensureConstraint(
      queryRunner,
      'fk_contract_lines_product',
      'ALTER TABLE "contract_lines" ADD CONSTRAINT "fk_contract_lines_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE NO ACTION;',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "contract_invoice_links" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "contract_id" uuid NOT NULL,
        "invoice_id" uuid NOT NULL,
        "period_start" date,
        "period_end" date,
        "created_at" timestamp(6) NOT NULL DEFAULT now(),
        CONSTRAINT "PK_contract_invoice_links" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_contract_invoice_links_tenant_contract_invoice" ON "contract_invoice_links" ("tenant_id", "contract_id", "invoice_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_contract_invoice_links_tenant_id" ON "contract_invoice_links" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_contract_invoice_links_tenant_contract" ON "contract_invoice_links" ("tenant_id", "contract_id")`,
    );

    await this.ensureConstraint(
      queryRunner,
      'fk_contract_invoice_links_contract',
      'ALTER TABLE "contract_invoice_links" ADD CONSTRAINT "fk_contract_invoice_links_contract" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE NO ACTION;',
    );
    await this.ensureConstraint(
      queryRunner,
      'fk_contract_invoice_links_invoice',
      'ALTER TABLE "contract_invoice_links" ADD CONSTRAINT "fk_contract_invoice_links_invoice" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE NO ACTION;',
    );
  }

  public async down(): Promise<void> {
    // no-op intentionally (reconciliation migration)
  }
}
