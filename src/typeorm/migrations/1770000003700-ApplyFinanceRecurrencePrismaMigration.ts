import { MigrationInterface, QueryRunner } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';

export class ApplyFinanceRecurrencePrismaMigration1770000003700 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const migrationPath = path.join(
      process.cwd(),
      'prisma',
      'migrations',
      '20260325190000_finance_recurrence_and_groups',
      'migration.sql',
    );
    const sql = fs.readFileSync(migrationPath, 'utf8');
    await queryRunner.query(sql);
  }

  public async down(): Promise<void> {
    // no-op
  }
}
