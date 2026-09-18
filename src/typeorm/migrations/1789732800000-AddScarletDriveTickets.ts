import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddScarletDriveTickets1789732800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "scarlet_drive_guests"
        ADD COLUMN IF NOT EXISTS "ticket_token" UUID NOT NULL DEFAULT uuid_generate_v4(),
        ADD COLUMN IF NOT EXISTS "checked_in_at" TIMESTAMPTZ(6);
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_scarlet_drive_guests_ticket_token"
        ON "scarlet_drive_guests" ("ticket_token");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "scarlet_drive_guests"
        DROP COLUMN IF EXISTS "ticket_token",
        DROP COLUMN IF EXISTS "checked_in_at";
    `);
  }
}
