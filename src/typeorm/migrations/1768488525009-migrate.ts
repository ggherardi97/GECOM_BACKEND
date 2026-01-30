import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
  TableUnique,
} from 'typeorm';

export class Migrate1769999999999 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---------------- Extensions ----------------
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // ---------------- Helper trigger: updated_at ----------------
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION set_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // ---------------- currencies ----------------
    await queryRunner.createTable(
      new Table({
        name: 'currencies',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isUnique: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          { name: 'code', type: 'varchar', length: '3', isNullable: false, isUnique: true }, // ISO 4217
          { name: 'name', type: 'varchar', length: '100', isNullable: false },
          { name: 'symbol', type: 'varchar', length: '10', isNullable: true },
          { name: 'decimals', type: 'smallint', isNullable: false, default: '2' },
          { name: 'is_active', type: 'boolean', isNullable: false, default: 'true' },
          { name: 'created_at', type: 'timestamptz', default: 'CURRENT_TIMESTAMP' },
          { name: 'updated_at', type: 'timestamptz', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true
    );

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_currencies_updated_at ON currencies;
      CREATE TRIGGER trg_currencies_updated_at
      BEFORE UPDATE ON currencies
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    `);

    // Optional seed (safe)
    await queryRunner.query(`
      INSERT INTO currencies (code, name, symbol, decimals)
      VALUES
        ('BRL', 'Brazilian Real', 'R$', 2),
        ('USD', 'US Dollar', '$', 2),
        ('EUR', 'Euro', '€', 2)
      ON CONFLICT (code) DO NOTHING;
    `);

    // ---------------- products ----------------
    await queryRunner.createTable(
      new Table({
        name: 'products',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isUnique: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'product_code',
            type: 'varchar',
            length: '80',
            isNullable: false,
            isUnique: true,
          },
          { name: 'name', type: 'varchar', length: '255', isNullable: false },
          { name: 'brand', type: 'varchar', length: '120', isNullable: true },
          { name: 'unit', type: 'varchar', length: '50', isNullable: true }, // box, pallet, etc
          { name: 'description', type: 'text', isNullable: true },

          { name: 'currency_id', type: 'uuid', isNullable: false },
          {
            name: 'default_unit_price',
            type: 'numeric',
            precision: 19,
            scale: 4,
            isNullable: false,
            default: '0',
          },
          // 0..1 (ex.: 0.15 = 15%)
          {
            name: 'default_tax_rate',
            type: 'numeric',
            precision: 9,
            scale: 4,
            isNullable: false,
            default: '0',
          },

          { name: 'is_active', type: 'boolean', isNullable: false, default: 'true' },

          { name: 'created_at', type: 'timestamptz', default: 'CURRENT_TIMESTAMP' },
          { name: 'updated_at', type: 'timestamptz', default: 'CURRENT_TIMESTAMP' },
        ],
        uniques: [
          new TableUnique({ name: 'uq_products_product_code', columnNames: ['product_code'] }),
        ],
      }),
      true
    );

    await queryRunner.createForeignKey(
      'products',
      new TableForeignKey({
        name: 'fk_products_currency',
        columnNames: ['currency_id'],
        referencedTableName: 'currencies',
        referencedColumnNames: ['id'],
        onDelete: 'RESTRICT',
      })
    );

    await queryRunner.createIndex(
      'products',
      new TableIndex({ name: 'idx_products_currency_id', columnNames: ['currency_id'] })
    );

    await queryRunner.createIndex(
      'products',
      new TableIndex({ name: 'idx_products_is_active', columnNames: ['is_active'] })
    );

    await queryRunner.query(`
      ALTER TABLE products
      ADD CONSTRAINT chk_products_default_unit_price_nonneg CHECK (default_unit_price >= 0);

      ALTER TABLE products
      ADD CONSTRAINT chk_products_default_tax_rate_range CHECK (default_tax_rate >= 0 AND default_tax_rate <= 1);
    `);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_products_updated_at ON products;
      CREATE TRIGGER trg_products_updated_at
      BEFORE UPDATE ON products
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    `);

    // ---------------- invoices sequence + triggers ----------------
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'invoices_invoice_seq_seq') THEN
          CREATE SEQUENCE invoices_invoice_seq_seq START 1 INCREMENT 1;
        END IF;
      END $$;
    `);

    await queryRunner.createTable(
      new Table({
        name: 'invoices',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isUnique: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },

          // seq used to build invoice_number
          {
            name: 'invoice_seq',
            type: 'bigint',
            isNullable: false,
            default: "nextval('invoices_invoice_seq_seq')",
          },
          {
            name: 'invoice_number',
            type: 'varchar',
            length: '30',
            isNullable: false,
            isUnique: true,
          },

          { name: 'company_id', type: 'uuid', isNullable: false },
          { name: 'currency_id', type: 'uuid', isNullable: false },

          { name: 'quote_at', type: 'timestamptz', isNullable: true },
          {
            name: 'exchange_rate',
            type: 'numeric',
            precision: 19,
            scale: 8,
            isNullable: false,
            default: '1',
          },

          { name: 'version', type: 'int', isNullable: false, default: '1' },

          // billing address
          { name: 'billing_address_line1', type: 'text', isNullable: true },
          { name: 'billing_address_line2', type: 'text', isNullable: true },
          { name: 'billing_address_city', type: 'text', isNullable: true },
          { name: 'billing_address_state', type: 'text', isNullable: true },
          { name: 'billing_address_postal_code', type: 'text', isNullable: true },
          { name: 'billing_address_country', type: 'text', isNullable: true },

          // 0 active, 1 expired, 2 invoiced, 3 paid
          { name: 'status', type: 'smallint', isNullable: false, default: '0' },

          // totals
          {
            name: 'subtotal',
            type: 'numeric',
            precision: 19,
            scale: 4,
            isNullable: false,
            default: '0',
          },
          { name: 'discount_percent', type: 'int', isNullable: false, default: '0' },
          {
            name: 'discount_amount',
            type: 'numeric',
            precision: 19,
            scale: 4,
            isNullable: false,
            default: '0',
          },
          {
            name: 'tax_total',
            type: 'numeric',
            precision: 19,
            scale: 4,
            isNullable: false,
            default: '0',
          },
          {
            name: 'fee_total',
            type: 'numeric',
            precision: 19,
            scale: 4,
            isNullable: false,
            default: '0',
          },
          {
            name: 'total',
            type: 'numeric',
            precision: 19,
            scale: 4,
            isNullable: false,
            default: '0',
          },

          // suggested lifecycle fields
          { name: 'issued_at', type: 'timestamptz', isNullable: true },
          { name: 'due_at', type: 'timestamptz', isNullable: true },
          { name: 'paid_at', type: 'timestamptz', isNullable: true },

          { name: 'notes', type: 'text', isNullable: true },
          { name: 'terms', type: 'text', isNullable: true },

          { name: 'created_at', type: 'timestamptz', default: 'CURRENT_TIMESTAMP' },
          { name: 'updated_at', type: 'timestamptz', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true
    );

    // FKs (companies must already exist)
    await queryRunner.createForeignKey(
      'invoices',
      new TableForeignKey({
        name: 'fk_invoices_company',
        columnNames: ['company_id'],
        referencedTableName: 'companies',
        referencedColumnNames: ['id'],
        onDelete: 'RESTRICT',
      })
    );

    await queryRunner.createForeignKey(
      'invoices',
      new TableForeignKey({
        name: 'fk_invoices_currency',
        columnNames: ['currency_id'],
        referencedTableName: 'currencies',
        referencedColumnNames: ['id'],
        onDelete: 'RESTRICT',
      })
    );

    await queryRunner.createIndex(
      'invoices',
      new TableIndex({ name: 'idx_invoices_company_id', columnNames: ['company_id'] })
    );
    await queryRunner.createIndex(
      'invoices',
      new TableIndex({ name: 'idx_invoices_currency_id', columnNames: ['currency_id'] })
    );
    await queryRunner.createIndex(
      'invoices',
      new TableIndex({ name: 'idx_invoices_status', columnNames: ['status'] })
    );
    await queryRunner.createIndex(
      'invoices',
      new TableIndex({ name: 'idx_invoices_company_status', columnNames: ['company_id', 'status'] })
    );

    await queryRunner.query(`
      ALTER TABLE invoices
      ADD CONSTRAINT chk_invoices_status CHECK (status IN (0,1,2,3));

      ALTER TABLE invoices
      ADD CONSTRAINT chk_invoices_discount_percent CHECK (discount_percent >= 0 AND discount_percent <= 100);

      ALTER TABLE invoices
      ADD CONSTRAINT chk_invoices_totals_nonneg CHECK (
        subtotal >= 0 AND discount_amount >= 0 AND tax_total >= 0 AND fee_total >= 0 AND total >= 0
      );

      ALTER TABLE invoices
      ADD CONSTRAINT chk_invoices_exchange_rate_pos CHECK (exchange_rate > 0);
    `);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_invoices_updated_at ON invoices;
      CREATE TRIGGER trg_invoices_updated_at
      BEFORE UPDATE ON invoices
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    `);

    // invoice_number auto: INV-0000001 based on invoice_seq
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION set_invoice_number()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.invoice_seq IS NULL THEN
          NEW.invoice_seq := nextval('invoices_invoice_seq_seq');
        END IF;

        IF NEW.invoice_number IS NULL OR length(trim(NEW.invoice_number)) = 0 THEN
          NEW.invoice_number := 'INV-' || lpad(NEW.invoice_seq::text, 7, '0');
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_invoices_set_invoice_number ON invoices;
      CREATE TRIGGER trg_invoices_set_invoice_number
      BEFORE INSERT ON invoices
      FOR EACH ROW EXECUTE FUNCTION set_invoice_number();
    `);

    // ---------------- invoice_lines ----------------
    await queryRunner.createTable(
      new Table({
        name: 'invoice_lines',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isUnique: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },

          { name: 'invoice_id', type: 'uuid', isNullable: false },
          { name: 'line_number', type: 'int', isNullable: false },

          { name: 'product_id', type: 'uuid', isNullable: true },
          { name: 'description', type: 'text', isNullable: true },
          { name: 'unit', type: 'varchar', length: '50', isNullable: true },

          {
            name: 'unit_price',
            type: 'numeric',
            precision: 19,
            scale: 4,
            isNullable: false,
            default: '0',
          },
          {
            name: 'quantity',
            type: 'numeric',
            precision: 19,
            scale: 4,
            isNullable: false,
            default: '1',
          },

          {
            name: 'tax_rate',
            type: 'numeric',
            precision: 9,
            scale: 4,
            isNullable: false,
            default: '0',
          },
          {
            name: 'tax_amount',
            type: 'numeric',
            precision: 19,
            scale: 4,
            isNullable: false,
            default: '0',
          },

          { name: 'discount_percent', type: 'int', isNullable: false, default: '0' },
          {
            name: 'discount_amount',
            type: 'numeric',
            precision: 19,
            scale: 4,
            isNullable: false,
            default: '0',
          },

          {
            name: 'line_subtotal',
            type: 'numeric',
            precision: 19,
            scale: 4,
            isNullable: false,
            default: '0',
          },
          {
            name: 'line_total',
            type: 'numeric',
            precision: 19,
            scale: 4,
            isNullable: false,
            default: '0',
          },

          { name: 'created_at', type: 'timestamptz', default: 'CURRENT_TIMESTAMP' },
          { name: 'updated_at', type: 'timestamptz', default: 'CURRENT_TIMESTAMP' },
        ],
        uniques: [
          new TableUnique({
            name: 'uq_invoice_lines_invoice_line',
            columnNames: ['invoice_id', 'line_number'],
          }),
        ],
      }),
      true
    );

    await queryRunner.createForeignKey(
      'invoice_lines',
      new TableForeignKey({
        name: 'fk_invoice_lines_invoice',
        columnNames: ['invoice_id'],
        referencedTableName: 'invoices',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      })
    );

    await queryRunner.createForeignKey(
      'invoice_lines',
      new TableForeignKey({
        name: 'fk_invoice_lines_product',
        columnNames: ['product_id'],
        referencedTableName: 'products',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      })
    );

    await queryRunner.createIndex(
      'invoice_lines',
      new TableIndex({ name: 'idx_invoice_lines_invoice_id', columnNames: ['invoice_id'] })
    );

    await queryRunner.createIndex(
      'invoice_lines',
      new TableIndex({ name: 'idx_invoice_lines_product_id', columnNames: ['product_id'] })
    );

    await queryRunner.query(`
      ALTER TABLE invoice_lines
      ADD CONSTRAINT chk_invoice_lines_tax_rate_range CHECK (tax_rate >= 0 AND tax_rate <= 1);

      ALTER TABLE invoice_lines
      ADD CONSTRAINT chk_invoice_lines_discount_percent CHECK (discount_percent >= 0 AND discount_percent <= 100);

      ALTER TABLE invoice_lines
      ADD CONSTRAINT chk_invoice_lines_prices_nonneg CHECK (
        unit_price >= 0 AND quantity >= 0 AND tax_amount >= 0 AND discount_amount >= 0 AND line_subtotal >= 0 AND line_total >= 0
      );
    `);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_invoice_lines_updated_at ON invoice_lines;
      CREATE TRIGGER trg_invoice_lines_updated_at
      BEFORE UPDATE ON invoice_lines
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop in reverse order

    // invoice_lines
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_invoice_lines_updated_at ON invoice_lines;`
    );
    await queryRunner.dropTable('invoice_lines', true);

    // invoices (drop triggers/functions)
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_invoices_set_invoice_number ON invoices;`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS set_invoice_number;`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_invoices_updated_at ON invoices;`);
    await queryRunner.dropTable('invoices', true);

    // products
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_products_updated_at ON products;`);
    await queryRunner.dropTable('products', true);

    // currencies
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_currencies_updated_at ON currencies;`);
    await queryRunner.dropTable('currencies', true);

    // sequence
    await queryRunner.query(`DROP SEQUENCE IF EXISTS invoices_invoice_seq_seq;`);

    // shared function
    await queryRunner.query(`DROP FUNCTION IF EXISTS set_updated_at;`);

    // keep uuid-ossp because the project uses it elsewhere
    // await queryRunner.query(`DROP EXTENSION IF EXISTS "uuid-ossp"`);
  }
}
