import * as fs from 'fs';
import * as path from 'path';
import { MigrationInterface, QueryRunner } from 'typeorm';

export class ApplyPrismaTradeAndStatusMigrations1770000001200 implements MigrationInterface {
  name = 'ApplyPrismaTradeAndStatusMigrations1770000001200';

  private async tableExists(queryRunner: QueryRunner, table: string): Promise<boolean> {
    const result = await queryRunner.query(`SELECT to_regclass($1) AS table_name`, [`public.${table}`]);
    return Boolean(result?.[0]?.table_name);
  }

  private async columnExists(
    queryRunner: QueryRunner,
    table: string,
    column: string,
  ): Promise<boolean> {
    const result = await queryRunner.query(
      `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
      LIMIT 1
      `,
      [table, column],
    );

    return result.length > 0;
  }

  private applyPrismaSqlMigration(queryRunner: QueryRunner, folder: string): Promise<void> {
    const sqlPath = path.resolve(process.cwd(), 'prisma', 'migrations', folder, 'migration.sql');

    if (!fs.existsSync(sqlPath)) {
      throw new Error(`Missing Prisma migration file: ${sqlPath}`);
    }

    // Some SQL files may contain UTF-8 BOM (EF BB BF / U+FEFF), which breaks Postgres parser.
    // Strip BOM defensively both at byte level and unicode char level.
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
    // Ensure trade simulation module objects exist.
    if (!(await this.tableExists(queryRunner, 'trade_simulations'))) {
      await this.applyPrismaSqlMigration(queryRunner, '20260222120000_add_trade_simulation_module');
    }

    // Ensure status configs base table/enum exists.
    if (!(await this.tableExists(queryRunner, 'status_configs'))) {
      await this.applyPrismaSqlMigration(queryRunner, '20260222133000_add_status_configs');
    }

    // Ensure status_config_id columns + relations exist in processes/invoices/leads.
    const hasProcessStatusConfig = await this.columnExists(queryRunner, 'processes', 'status_config_id');
    const hasInvoiceStatusConfig = await this.columnExists(queryRunner, 'invoices', 'status_config_id');
    const hasLeadStatusConfig = await this.columnExists(queryRunner, 'leads', 'status_config_id');

    if (!hasProcessStatusConfig || !hasInvoiceStatusConfig || !hasLeadStatusConfig) {
      await this.applyPrismaSqlMigration(queryRunner, '20260223113000_add_status_config_relations');
    }

    // Ensure processes.total_value exists.
    if (!(await this.columnExists(queryRunner, 'processes', 'total_value'))) {
      await this.applyPrismaSqlMigration(queryRunner, '20260223123000_add_process_total_value');
    }
  }

  public async down(): Promise<void> {
    // No-op by design: reconciliation migration.
  }
}
