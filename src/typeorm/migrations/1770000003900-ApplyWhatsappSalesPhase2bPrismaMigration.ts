import { MigrationInterface, QueryRunner } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';

export class ApplyWhatsappSalesPhase2bPrismaMigration1770000003900 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const migrationPath = path.join(
      process.cwd(),
      'prisma',
      'migrations',
      '20260326103000_add_sales_whatsapp_phase2b',
      'migration.sql',
    );
    const sql = fs.readFileSync(migrationPath, 'utf8');
    await queryRunner.query(sql);
  }

  public async down(): Promise<void> {
    // no-op
  }
}
