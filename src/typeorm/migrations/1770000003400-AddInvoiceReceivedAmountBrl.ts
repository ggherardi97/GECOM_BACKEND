import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInvoiceReceivedAmountBrl1770000003400 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS received_amount_brl NUMERIC(19,4) NULL;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'chk_invoices_received_amount_brl_nonneg'
        ) THEN
          ALTER TABLE invoices
          ADD CONSTRAINT chk_invoices_received_amount_brl_nonneg
          CHECK (received_amount_brl IS NULL OR received_amount_brl >= 0);
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE invoices DROP CONSTRAINT IF EXISTS chk_invoices_received_amount_brl_nonneg;`);
    await queryRunner.query(`ALTER TABLE invoices DROP COLUMN IF EXISTS received_amount_brl;`);
  }
}
