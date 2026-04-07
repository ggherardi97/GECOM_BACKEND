import * as fs from 'fs';
import * as path from 'path';
import { MigrationInterface, QueryRunner } from 'typeorm';

export class ApplyWhatsappSalesPhase2aPrismaMigration1770000003500 implements MigrationInterface {
  name = 'ApplyWhatsappSalesPhase2aPrismaMigration1770000003500';

  private applyPrismaSqlMigration(queryRunner: QueryRunner, folder: string): Promise<void> {
    const sqlPath = path.resolve(process.cwd(), 'prisma', 'migrations', folder, 'migration.sql');

    if (!fs.existsSync(sqlPath)) {
      throw new Error(`Missing Prisma migration file: ${sqlPath}`);
    }

    const fileBuffer = fs.readFileSync(sqlPath);
    const withoutBomBytes =
      fileBuffer.length >= 3 &&
      fileBuffer[0] === 0xef &&
      fileBuffer[1] === 0xbb &&
      fileBuffer[2] === 0xbf
        ? fileBuffer.slice(3)
        : fileBuffer;
    const sql = withoutBomBytes.toString('utf8').replace(/\uFEFF/g, '');
    return queryRunner.query(sql);
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.applyPrismaSqlMigration(queryRunner, '20260325103000_add_sales_whatsapp_phase2a');
  }

  public async down(): Promise<void> {
    // No-op by design: reconciliation migration.
  }
}
