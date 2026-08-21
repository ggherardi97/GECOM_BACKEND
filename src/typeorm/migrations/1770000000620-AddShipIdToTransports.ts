import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddShipIdToTransports1770000000620 implements MigrationInterface {
  name = 'AddShipIdToTransports1770000000620';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE transports
      ADD COLUMN IF NOT EXISTS ship_id varchar(120) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE transports
      DROP COLUMN IF EXISTS ship_id
    `);
  }
}
