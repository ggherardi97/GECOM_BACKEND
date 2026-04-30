import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddScarletDriveAnswerMode1770000004200 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "scarlet_drive_vote_sessions"
      ADD COLUMN IF NOT EXISTS "answer_mode" VARCHAR(20) NOT NULL DEFAULT 'yes_no'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "scarlet_drive_vote_sessions"
      DROP COLUMN IF EXISTS "answer_mode"
    `);
  }
}
