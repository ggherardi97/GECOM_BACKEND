import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCpfToCompanies1770000002600 implements MigrationInterface {
  name = 'AddCpfToCompanies1770000002600';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF to_regclass('public.companies') IS NOT NULL
           AND NOT EXISTS (
             SELECT 1
             FROM information_schema.columns
             WHERE table_schema = 'public'
               AND table_name = 'companies'
               AND column_name = 'cpf'
           ) THEN
          ALTER TABLE "companies" ADD COLUMN "cpf" character varying;
        END IF;
      END$$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "companies"
      DROP COLUMN IF EXISTS "cpf";
    `);
  }
}

