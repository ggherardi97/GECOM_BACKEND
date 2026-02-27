import { MigrationInterface, QueryRunner } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { HR_MODULE_SQL } from '../sql/hr-module.inline';

export class CreateHrModule1770000001900 implements MigrationInterface {
  name = 'CreateHrModule1770000001900';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const candidates = [
      path.resolve(process.cwd(), 'src', 'typeorm', 'sql', 'hr-module.sql'),
      path.resolve(process.cwd(), 'dist', 'typeorm', 'sql', 'hr-module.sql'),
      path.resolve(__dirname, '..', 'sql', 'hr-module.sql'),
    ];
    const sqlPath = candidates.find((candidate) => fs.existsSync(candidate));
    const sql = sqlPath ? fs.readFileSync(sqlPath, 'utf8') : HR_MODULE_SQL;
    await queryRunner.query(sql);
  }

  public async down(): Promise<void> {
    // no-op intentionally (reconciliation migration)
  }
}
