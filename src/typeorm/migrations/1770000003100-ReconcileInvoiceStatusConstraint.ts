import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReconcileInvoiceStatusConstraint1770000003100 implements MigrationInterface {
  name = 'ReconcileInvoiceStatusConstraint1770000003100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.query(`
      SELECT pg_get_constraintdef(c.oid) AS definition
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      WHERE t.relname = 'invoices'
        AND c.conname = 'chk_invoices_status'
      LIMIT 1
    `);

    const definition = String(rows?.[0]?.definition ?? '');
    if (definition.includes('4')) {
      return;
    }

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
