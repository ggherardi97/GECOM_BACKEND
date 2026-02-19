import { MigrationInterface, QueryRunner } from 'typeorm';

export class AllowTenantWithoutCompany1770000000700 implements MigrationInterface {
  name = 'AllowTenantWithoutCompany1770000000700';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE tenants
      ALTER COLUMN company_id DROP NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.query(`
      SELECT COUNT(*)::int AS count
      FROM tenants
      WHERE company_id IS NULL
    `);

    const nullCount = Number(rows?.[0]?.count ?? 0);
    if (nullCount > 0) {
      throw new Error(
        'Cannot rollback AllowTenantWithoutCompany: tenants with NULL company_id exist.'
      );
    }

    await queryRunner.query(`
      ALTER TABLE tenants
      ALTER COLUMN company_id SET NOT NULL
    `);
  }
}
