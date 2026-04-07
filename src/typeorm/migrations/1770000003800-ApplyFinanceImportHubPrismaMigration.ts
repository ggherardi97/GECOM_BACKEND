import { MigrationInterface, QueryRunner } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';

export class ApplyFinanceImportHubPrismaMigration1770000003800 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const migrationPath = path.join(
      process.cwd(),
      'prisma',
      'migrations',
      '20260325213000_finance_import_hub',
      'migration.sql',
    );
    const sql = fs.readFileSync(migrationPath, 'utf8');
    await queryRunner.query(sql);
  }

  public async down(): Promise<void> {
    // no-op
  }
}
