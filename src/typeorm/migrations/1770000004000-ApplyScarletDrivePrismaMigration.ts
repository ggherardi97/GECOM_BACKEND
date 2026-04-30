import { MigrationInterface, QueryRunner } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';

export class ApplyScarletDrivePrismaMigration1770000004000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const migrationPath = path.join(
      process.cwd(),
      'prisma',
      'migrations',
      '20260414160000_add_scarlet_drive',
      'migration.sql',
    );
    const sql = fs.readFileSync(migrationPath, 'utf8');
    await queryRunner.query(sql);
  }

  public async down(): Promise<void> {
    // no-op
  }
}
