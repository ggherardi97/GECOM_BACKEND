import { MigrationInterface, QueryRunner } from 'typeorm';

export class UsersTenantNotNull1769999999011 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasUsers = await queryRunner.hasTable('users');
    if (!hasUsers) return;

    const usersTable = await queryRunner.getTable('users');
    const hasTenantId = !!usersTable?.findColumnByName('tenant_id');
    if (!hasTenantId) return;

    await queryRunner.query(`
      UPDATE users
      SET tenant_id = '2f1803b2-4b33-4f86-8fb5-484f67472705'
      WHERE tenant_id IS NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE users
      ALTER COLUMN tenant_id SET NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasUsers = await queryRunner.hasTable('users');
    if (!hasUsers) return;

    const usersTable = await queryRunner.getTable('users');
    const hasTenantId = !!usersTable?.findColumnByName('tenant_id');
    if (!hasTenantId) return;

    await queryRunner.query(`
      ALTER TABLE users
      ALTER COLUMN tenant_id DROP NOT NULL;
    `);
  }
}
