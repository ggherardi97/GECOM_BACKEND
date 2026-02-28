import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddModuleAreaKeysToModules1770000002200 implements MigrationInterface {
  name = 'AddModuleAreaKeysToModules1770000002200';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "modules"
      ADD COLUMN IF NOT EXISTS "area_keys_json" jsonb NOT NULL DEFAULT '[]'::jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "modules"
      DROP COLUMN IF EXISTS "area_keys_json"
    `);
  }
}

