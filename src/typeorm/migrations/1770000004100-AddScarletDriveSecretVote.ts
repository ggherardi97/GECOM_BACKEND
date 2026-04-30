import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddScarletDriveSecretVote1770000004100 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "scarlet_drive_vote_sessions"
      ADD COLUMN IF NOT EXISTS "is_secret" BOOLEAN NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "scarlet_drive_vote_sessions"
      DROP COLUMN IF EXISTS "is_secret"
    `);
  }
}
