import { MigrationInterface, QueryRunner } from 'typeorm';

export class UsersTenantNotNull1769999999011 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Segurança: se ainda existir algum user sem tenant_id, backfill usando o tenant principal
    // (troca o UUID se você quiser outro)
    await queryRunner.query(`
      UPDATE users
      SET tenant_id = '2f1803b2-4b33-4f86-8fb5-484f67472705'
      WHERE tenant_id IS NULL;
    `);

    // Agora sim: NOT NULL
    await queryRunner.query(`
      ALTER TABLE users
      ALTER COLUMN tenant_id SET NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
      ALTER COLUMN tenant_id DROP NOT NULL;
    `);
  }
}