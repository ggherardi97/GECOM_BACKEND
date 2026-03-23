import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixInvoicePaidStatusConstraint1770000003000 implements MigrationInterface {
  name = 'FixInvoicePaidStatusConstraint1770000003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "invoices"
      DROP CONSTRAINT IF EXISTS "chk_invoices_status"
    `);

    await queryRunner.query(`
      ALTER TABLE "invoices"
      ADD CONSTRAINT "chk_invoices_status"
      CHECK ("status" IN (0, 1, 2, 3, 4))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "invoices"
      DROP CONSTRAINT IF EXISTS "chk_invoices_status"
    `);

    await queryRunner.query(`
      ALTER TABLE "invoices"
      ADD CONSTRAINT "chk_invoices_status"
      CHECK ("status" IN (0, 1, 2, 3))
    `);
  }
}
