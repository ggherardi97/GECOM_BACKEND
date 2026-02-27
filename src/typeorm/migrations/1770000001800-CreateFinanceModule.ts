import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFinanceModule1770000001800 implements MigrationInterface {
  name = 'CreateFinanceModule1770000001800';

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
    await this.ensureEnum(queryRunner, 'FinancialCategoryKind', ['REVENUE', 'EXPENSE', 'TRANSFER']);
    await this.ensureEnum(queryRunner, 'FinancialAccountType', [
      'CASH',
      'CHECKING',
      'SAVINGS',
      'INVESTMENT',
      'DIGITAL_WALLET',
    ]);
    await this.ensureEnum(queryRunner, 'FinancialEntryStatus', ['OPEN', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELED']);
    await this.ensureEnum(queryRunner, 'FinancialPaymentMethod', [
      'BANK_TRANSFER',
      'PIX',
      'CREDIT_CARD',
      'DEBIT_CARD',
      'CASH',
      'BOLETO',
      'CHECK',
      'OTHER',
    ]);
    await this.ensureEnum(queryRunner, 'FinancialMovementType', ['CREDIT', 'DEBIT']);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "financial_cost_centers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "code" character varying(40) NOT NULL,
        "name" character varying(150) NOT NULL,
        "description" text,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamp(6) NOT NULL DEFAULT now(),
        "updated_at" timestamp(6) NOT NULL DEFAULT now(),
        CONSTRAINT "PK_financial_cost_centers" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_financial_cost_centers_tenant_code" ON "financial_cost_centers" ("tenant_id", "code")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_financial_cost_centers_tenant_id" ON "financial_cost_centers" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_financial_cost_centers_tenant_active" ON "financial_cost_centers" ("tenant_id", "is_active")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "financial_categories" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "code" character varying(40) NOT NULL,
        "name" character varying(150) NOT NULL,
        "kind" "FinancialCategoryKind" NOT NULL DEFAULT 'EXPENSE',
        "parent_category_id" uuid,
        "cost_center_id" uuid,
        "description" text,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamp(6) NOT NULL DEFAULT now(),
        "updated_at" timestamp(6) NOT NULL DEFAULT now(),
        CONSTRAINT "PK_financial_categories" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_financial_categories_tenant_code" ON "financial_categories" ("tenant_id", "code")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_financial_categories_tenant_id" ON "financial_categories" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_financial_categories_tenant_kind" ON "financial_categories" ("tenant_id", "kind")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_financial_categories_tenant_parent" ON "financial_categories" ("tenant_id", "parent_category_id")`,
    );

    await this.ensureConstraint(
      queryRunner,
      'fk_financial_categories_parent',
      'ALTER TABLE "financial_categories" ADD CONSTRAINT "fk_financial_categories_parent" FOREIGN KEY ("parent_category_id") REFERENCES "financial_categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION;',
    );
    await this.ensureConstraint(
      queryRunner,
      'fk_financial_categories_cost_center',
      'ALTER TABLE "financial_categories" ADD CONSTRAINT "fk_financial_categories_cost_center" FOREIGN KEY ("cost_center_id") REFERENCES "financial_cost_centers"("id") ON DELETE SET NULL ON UPDATE NO ACTION;',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "financial_bank_accounts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "name" character varying(150) NOT NULL,
        "bank_name" character varying(120),
        "agency" character varying(20),
        "account_number" character varying(40),
        "account_type" "FinancialAccountType" NOT NULL DEFAULT 'CHECKING',
        "currency_id" uuid NOT NULL,
        "opening_balance" numeric(19,4) NOT NULL DEFAULT 0,
        "current_balance" numeric(19,4) NOT NULL DEFAULT 0,
        "allow_negative" boolean NOT NULL DEFAULT false,
        "is_active" boolean NOT NULL DEFAULT true,
        "reconciliation_date" date,
        "notes" text,
        "created_at" timestamp(6) NOT NULL DEFAULT now(),
        "updated_at" timestamp(6) NOT NULL DEFAULT now(),
        CONSTRAINT "PK_financial_bank_accounts" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_financial_bank_accounts_tenant_id" ON "financial_bank_accounts" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_financial_bank_accounts_tenant_currency" ON "financial_bank_accounts" ("tenant_id", "currency_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_financial_bank_accounts_tenant_active" ON "financial_bank_accounts" ("tenant_id", "is_active")`,
    );
    await this.ensureConstraint(
      queryRunner,
      'fk_financial_bank_accounts_currency',
      'ALTER TABLE "financial_bank_accounts" ADD CONSTRAINT "fk_financial_bank_accounts_currency" FOREIGN KEY ("currency_id") REFERENCES "currencies"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "financial_bank_movements" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "bank_account_id" uuid NOT NULL,
        "movement_date" timestamp(6) NOT NULL DEFAULT now(),
        "movement_type" "FinancialMovementType" NOT NULL,
        "amount" numeric(19,4) NOT NULL,
        "description" text,
        "category_id" uuid,
        "cost_center_id" uuid,
        "reference_table" character varying(60),
        "reference_id" uuid,
        "reconciled" boolean NOT NULL DEFAULT false,
        "reconciliation_note" text,
        "created_at" timestamp(6) NOT NULL DEFAULT now(),
        "updated_at" timestamp(6) NOT NULL DEFAULT now(),
        CONSTRAINT "PK_financial_bank_movements" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_financial_bank_movements_tenant_id" ON "financial_bank_movements" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_financial_bank_movements_tenant_account" ON "financial_bank_movements" ("tenant_id", "bank_account_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_financial_bank_movements_tenant_date" ON "financial_bank_movements" ("tenant_id", "movement_date")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_financial_bank_movements_tenant_reconciled" ON "financial_bank_movements" ("tenant_id", "reconciled")`,
    );
    await this.ensureConstraint(
      queryRunner,
      'fk_financial_bank_movements_account',
      'ALTER TABLE "financial_bank_movements" ADD CONSTRAINT "fk_financial_bank_movements_account" FOREIGN KEY ("bank_account_id") REFERENCES "financial_bank_accounts"("id") ON DELETE CASCADE ON UPDATE NO ACTION;',
    );
    await this.ensureConstraint(
      queryRunner,
      'fk_financial_bank_movements_category',
      'ALTER TABLE "financial_bank_movements" ADD CONSTRAINT "fk_financial_bank_movements_category" FOREIGN KEY ("category_id") REFERENCES "financial_categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION;',
    );
    await this.ensureConstraint(
      queryRunner,
      'fk_financial_bank_movements_cost_center',
      'ALTER TABLE "financial_bank_movements" ADD CONSTRAINT "fk_financial_bank_movements_cost_center" FOREIGN KEY ("cost_center_id") REFERENCES "financial_cost_centers"("id") ON DELETE SET NULL ON UPDATE NO ACTION;',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "financial_receivables" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "title_number" character varying(80) NOT NULL,
        "description" text,
        "company_id" uuid NOT NULL,
        "invoice_id" uuid,
        "document_id" uuid,
        "currency_id" uuid NOT NULL,
        "category_id" uuid,
        "cost_center_id" uuid,
        "issue_date" date,
        "due_date" date NOT NULL,
        "original_amount" numeric(19,4) NOT NULL DEFAULT 0,
        "paid_amount" numeric(19,4) NOT NULL DEFAULT 0,
        "outstanding_amount" numeric(19,4) NOT NULL DEFAULT 0,
        "installment_number" integer NOT NULL DEFAULT 1,
        "installment_total" integer NOT NULL DEFAULT 1,
        "status" "FinancialEntryStatus" NOT NULL DEFAULT 'OPEN',
        "is_delinquent" boolean NOT NULL DEFAULT false,
        "delinquent_days" integer NOT NULL DEFAULT 0,
        "notes" text,
        "created_at" timestamp(6) NOT NULL DEFAULT now(),
        "updated_at" timestamp(6) NOT NULL DEFAULT now(),
        CONSTRAINT "PK_financial_receivables" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_financial_receivables_tenant_title" ON "financial_receivables" ("tenant_id", "title_number")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_financial_receivables_tenant_id" ON "financial_receivables" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_financial_receivables_tenant_status" ON "financial_receivables" ("tenant_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_financial_receivables_tenant_due" ON "financial_receivables" ("tenant_id", "due_date")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_financial_receivables_tenant_company" ON "financial_receivables" ("tenant_id", "company_id")`,
    );
    await this.ensureConstraint(
      queryRunner,
      'fk_financial_receivables_company',
      'ALTER TABLE "financial_receivables" ADD CONSTRAINT "fk_financial_receivables_company" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;',
    );
    await this.ensureConstraint(
      queryRunner,
      'fk_financial_receivables_invoice',
      'ALTER TABLE "financial_receivables" ADD CONSTRAINT "fk_financial_receivables_invoice" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE NO ACTION;',
    );
    await this.ensureConstraint(
      queryRunner,
      'fk_financial_receivables_document',
      'ALTER TABLE "financial_receivables" ADD CONSTRAINT "fk_financial_receivables_document" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE NO ACTION;',
    );
    await this.ensureConstraint(
      queryRunner,
      'fk_financial_receivables_currency',
      'ALTER TABLE "financial_receivables" ADD CONSTRAINT "fk_financial_receivables_currency" FOREIGN KEY ("currency_id") REFERENCES "currencies"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;',
    );
    await this.ensureConstraint(
      queryRunner,
      'fk_financial_receivables_category',
      'ALTER TABLE "financial_receivables" ADD CONSTRAINT "fk_financial_receivables_category" FOREIGN KEY ("category_id") REFERENCES "financial_categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION;',
    );
    await this.ensureConstraint(
      queryRunner,
      'fk_financial_receivables_cost_center',
      'ALTER TABLE "financial_receivables" ADD CONSTRAINT "fk_financial_receivables_cost_center" FOREIGN KEY ("cost_center_id") REFERENCES "financial_cost_centers"("id") ON DELETE SET NULL ON UPDATE NO ACTION;',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "financial_payables" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "payable_number" character varying(80) NOT NULL,
        "description" text,
        "company_id" uuid,
        "document_id" uuid,
        "currency_id" uuid NOT NULL,
        "category_id" uuid,
        "cost_center_id" uuid,
        "issue_date" date,
        "due_date" date NOT NULL,
        "original_amount" numeric(19,4) NOT NULL DEFAULT 0,
        "paid_amount" numeric(19,4) NOT NULL DEFAULT 0,
        "outstanding_amount" numeric(19,4) NOT NULL DEFAULT 0,
        "installment_number" integer NOT NULL DEFAULT 1,
        "installment_total" integer NOT NULL DEFAULT 1,
        "status" "FinancialEntryStatus" NOT NULL DEFAULT 'OPEN',
        "is_delinquent" boolean NOT NULL DEFAULT false,
        "delinquent_days" integer NOT NULL DEFAULT 0,
        "notes" text,
        "created_at" timestamp(6) NOT NULL DEFAULT now(),
        "updated_at" timestamp(6) NOT NULL DEFAULT now(),
        CONSTRAINT "PK_financial_payables" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_financial_payables_tenant_number" ON "financial_payables" ("tenant_id", "payable_number")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_financial_payables_tenant_id" ON "financial_payables" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_financial_payables_tenant_status" ON "financial_payables" ("tenant_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_financial_payables_tenant_due" ON "financial_payables" ("tenant_id", "due_date")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_financial_payables_tenant_company" ON "financial_payables" ("tenant_id", "company_id")`,
    );
    await this.ensureConstraint(
      queryRunner,
      'fk_financial_payables_company',
      'ALTER TABLE "financial_payables" ADD CONSTRAINT "fk_financial_payables_company" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE NO ACTION;',
    );
    await this.ensureConstraint(
      queryRunner,
      'fk_financial_payables_document',
      'ALTER TABLE "financial_payables" ADD CONSTRAINT "fk_financial_payables_document" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE NO ACTION;',
    );
    await this.ensureConstraint(
      queryRunner,
      'fk_financial_payables_currency',
      'ALTER TABLE "financial_payables" ADD CONSTRAINT "fk_financial_payables_currency" FOREIGN KEY ("currency_id") REFERENCES "currencies"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;',
    );
    await this.ensureConstraint(
      queryRunner,
      'fk_financial_payables_category',
      'ALTER TABLE "financial_payables" ADD CONSTRAINT "fk_financial_payables_category" FOREIGN KEY ("category_id") REFERENCES "financial_categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION;',
    );
    await this.ensureConstraint(
      queryRunner,
      'fk_financial_payables_cost_center',
      'ALTER TABLE "financial_payables" ADD CONSTRAINT "fk_financial_payables_cost_center" FOREIGN KEY ("cost_center_id") REFERENCES "financial_cost_centers"("id") ON DELETE SET NULL ON UPDATE NO ACTION;',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "financial_receivable_payments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "receivable_id" uuid NOT NULL,
        "bank_account_id" uuid,
        "bank_movement_id" uuid,
        "payment_date" timestamp(6) NOT NULL DEFAULT now(),
        "amount" numeric(19,4) NOT NULL DEFAULT 0,
        "fee_amount" numeric(19,4) NOT NULL DEFAULT 0,
        "interest_amount" numeric(19,4) NOT NULL DEFAULT 0,
        "discount_amount" numeric(19,4) NOT NULL DEFAULT 0,
        "payment_method" "FinancialPaymentMethod" NOT NULL DEFAULT 'OTHER',
        "reference" character varying(120),
        "notes" text,
        "created_at" timestamp(6) NOT NULL DEFAULT now(),
        "updated_at" timestamp(6) NOT NULL DEFAULT now(),
        CONSTRAINT "PK_financial_receivable_payments" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_financial_receivable_payments_bank_movement" ON "financial_receivable_payments" ("bank_movement_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_financial_receivable_payments_tenant_id" ON "financial_receivable_payments" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_financial_receivable_payments_tenant_receivable" ON "financial_receivable_payments" ("tenant_id", "receivable_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_financial_receivable_payments_tenant_date" ON "financial_receivable_payments" ("tenant_id", "payment_date")`,
    );
    await this.ensureConstraint(
      queryRunner,
      'fk_financial_receivable_payments_receivable',
      'ALTER TABLE "financial_receivable_payments" ADD CONSTRAINT "fk_financial_receivable_payments_receivable" FOREIGN KEY ("receivable_id") REFERENCES "financial_receivables"("id") ON DELETE CASCADE ON UPDATE NO ACTION;',
    );
    await this.ensureConstraint(
      queryRunner,
      'fk_financial_receivable_payments_bank_account',
      'ALTER TABLE "financial_receivable_payments" ADD CONSTRAINT "fk_financial_receivable_payments_bank_account" FOREIGN KEY ("bank_account_id") REFERENCES "financial_bank_accounts"("id") ON DELETE SET NULL ON UPDATE NO ACTION;',
    );
    await this.ensureConstraint(
      queryRunner,
      'fk_financial_receivable_payments_bank_movement',
      'ALTER TABLE "financial_receivable_payments" ADD CONSTRAINT "fk_financial_receivable_payments_bank_movement" FOREIGN KEY ("bank_movement_id") REFERENCES "financial_bank_movements"("id") ON DELETE SET NULL ON UPDATE NO ACTION;',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "financial_payable_payments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "payable_id" uuid NOT NULL,
        "bank_account_id" uuid,
        "bank_movement_id" uuid,
        "payment_date" timestamp(6) NOT NULL DEFAULT now(),
        "amount" numeric(19,4) NOT NULL DEFAULT 0,
        "fee_amount" numeric(19,4) NOT NULL DEFAULT 0,
        "interest_amount" numeric(19,4) NOT NULL DEFAULT 0,
        "discount_amount" numeric(19,4) NOT NULL DEFAULT 0,
        "payment_method" "FinancialPaymentMethod" NOT NULL DEFAULT 'OTHER',
        "reference" character varying(120),
        "notes" text,
        "created_at" timestamp(6) NOT NULL DEFAULT now(),
        "updated_at" timestamp(6) NOT NULL DEFAULT now(),
        CONSTRAINT "PK_financial_payable_payments" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_financial_payable_payments_bank_movement" ON "financial_payable_payments" ("bank_movement_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_financial_payable_payments_tenant_id" ON "financial_payable_payments" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_financial_payable_payments_tenant_payable" ON "financial_payable_payments" ("tenant_id", "payable_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_financial_payable_payments_tenant_date" ON "financial_payable_payments" ("tenant_id", "payment_date")`,
    );
    await this.ensureConstraint(
      queryRunner,
      'fk_financial_payable_payments_payable',
      'ALTER TABLE "financial_payable_payments" ADD CONSTRAINT "fk_financial_payable_payments_payable" FOREIGN KEY ("payable_id") REFERENCES "financial_payables"("id") ON DELETE CASCADE ON UPDATE NO ACTION;',
    );
    await this.ensureConstraint(
      queryRunner,
      'fk_financial_payable_payments_bank_account',
      'ALTER TABLE "financial_payable_payments" ADD CONSTRAINT "fk_financial_payable_payments_bank_account" FOREIGN KEY ("bank_account_id") REFERENCES "financial_bank_accounts"("id") ON DELETE SET NULL ON UPDATE NO ACTION;',
    );
    await this.ensureConstraint(
      queryRunner,
      'fk_financial_payable_payments_bank_movement',
      'ALTER TABLE "financial_payable_payments" ADD CONSTRAINT "fk_financial_payable_payments_bank_movement" FOREIGN KEY ("bank_movement_id") REFERENCES "financial_bank_movements"("id") ON DELETE SET NULL ON UPDATE NO ACTION;',
    );
  }

  public async down(): Promise<void> {
    // no-op intentionally (reconciliation migration)
  }
}
