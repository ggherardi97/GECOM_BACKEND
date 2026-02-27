import { MigrationInterface, QueryRunner } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';

export class CreateHrModule1770000001900 implements MigrationInterface {
  name = 'CreateHrModule1770000001900';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const candidates = [
      path.resolve(process.cwd(), 'src', 'typeorm', 'sql', 'hr-module.sql'),
      path.resolve(process.cwd(), 'dist', 'typeorm', 'sql', 'hr-module.sql'),
      path.resolve(__dirname, '..', 'sql', 'hr-module.sql'),
    ];
    const sqlPath = candidates.find((candidate) => fs.existsSync(candidate));
    if (!sqlPath) {
      throw new Error(`Missing SQL migration file. Tried: ${candidates.join(' | ')}`);
    }

    const sql = fs.readFileSync(sqlPath, 'utf8');
    await queryRunner.query(sql);
  }

  public async down(): Promise<void> {
    // no-op intentionally (reconciliation migration)
  }
}
