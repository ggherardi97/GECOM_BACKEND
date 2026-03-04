import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBillingAreaEntityConfig1770000002300 implements MigrationInterface {
  name = 'CreateBillingAreaEntityConfig1770000002300';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "billing_area_entity_config" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "config_key" character varying(80) NOT NULL DEFAULT 'default',
        "config_json" jsonb NOT NULL,
        "created_at" timestamptz(6) NOT NULL DEFAULT now(),
        "updated_at" timestamptz(6) NOT NULL DEFAULT now(),
        CONSTRAINT "PK_billing_area_entity_config" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_billing_area_entity_config_key"
      ON "billing_area_entity_config" ("config_key")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_billing_area_entity_config_updated_at"
      ON "billing_area_entity_config" ("updated_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "billing_area_entity_config"');
  }
}
