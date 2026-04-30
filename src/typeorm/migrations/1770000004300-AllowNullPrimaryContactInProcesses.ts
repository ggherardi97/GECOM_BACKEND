import { MigrationInterface, QueryRunner } from 'typeorm';

export class AllowNullPrimaryContactInProcesses1770000004300 implements MigrationInterface {
  name = 'AllowNullPrimaryContactInProcesses1770000004300';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "processes" ALTER COLUMN "primary_contact_id" DROP NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "processes" ALTER COLUMN "primary_contact_id" SET NOT NULL`);
  }
}

