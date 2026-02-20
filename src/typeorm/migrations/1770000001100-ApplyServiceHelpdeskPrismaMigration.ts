import * as fs from 'fs';
import * as path from 'path';
import { MigrationInterface, QueryRunner } from 'typeorm';

export class ApplyServiceHelpdeskPrismaMigration1770000001100 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const existsResult = await queryRunner.query(
      `SELECT to_regclass('public.incidents') AS incidents_table`,
    );

    if (existsResult?.[0]?.incidents_table) {
      return;
    }

    const sqlPath = path.resolve(
      process.cwd(),
      'prisma',
      'migrations',
      '20260219163000_add_service_helpdesk_module',
      'migration.sql',
    );

    if (!fs.existsSync(sqlPath)) {
      throw new Error(`Missing Prisma migration file: ${sqlPath}`);
    }

    const sql = fs.readFileSync(sqlPath, 'utf8');
    await queryRunner.query(sql);
  }

  public async down(): Promise<void> {
    // No-op on purpose: this migration only backfills missing schema objects.
  }
}
