import { MigrationInterface, QueryRunner } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';

export class CreateHrModule1770000001900 implements MigrationInterface {
  name = 'CreateHrModule1770000001900';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const sqlPath = path.resolve(process.cwd(), 'src', 'typeorm', 'sql', 'hr-module.sql');
    if (!fs.existsSync(sqlPath)) {
      throw new Error(`Missing SQL migration file: ${sqlPath}`);
    }

    const sql = fs.readFileSync(sqlPath, 'utf8');
    await queryRunner.query(sql);
  }

  public async down(): Promise<void> {
    // no-op intentionally (reconciliation migration)
  }
}

