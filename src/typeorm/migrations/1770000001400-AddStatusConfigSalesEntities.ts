import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStatusConfigSalesEntities1770000001400 implements MigrationInterface {
  name = 'AddStatusConfigSalesEntities1770000001400';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_type
          WHERE typname = 'status_config_entity'
        ) AND NOT EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_enum e ON e.enumtypid = t.oid
          WHERE t.typname = 'status_config_entity'
            AND e.enumlabel = 'OPPORTUNITY'
        ) THEN
          ALTER TYPE "status_config_entity" ADD VALUE 'OPPORTUNITY';
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_type
          WHERE typname = 'status_config_entity'
        ) AND NOT EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_enum e ON e.enumtypid = t.oid
          WHERE t.typname = 'status_config_entity'
            AND e.enumlabel = 'CONTRACT'
        ) THEN
          ALTER TYPE "status_config_entity" ADD VALUE 'CONTRACT';
        END IF;
      END $$;
    `);
  }

  public async down(): Promise<void> {
    // no-op: removing enum values is unsafe in shared envs.
  }
}
