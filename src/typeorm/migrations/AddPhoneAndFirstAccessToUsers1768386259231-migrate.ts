import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPhoneAndFirstAccessToUsers1767000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "phonenumber" varchar(50)
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "first_access" boolean NOT NULL DEFAULT true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN "first_access"
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN "phonenumber"
    `);
  }
}
