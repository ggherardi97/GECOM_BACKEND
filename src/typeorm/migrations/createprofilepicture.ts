import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class Migrate1762950925401 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // -------------------- users --------------------
    const hasUsers = await queryRunner.hasTable("users");
    if (hasUsers) {
      const usersTable = await queryRunner.getTable("users");
      const hasProfilePicture = !!usersTable?.findColumnByName("profile_picture");
      const hasAceptTerms = !!usersTable?.findColumnByName("acept_terms");

      if (!hasProfilePicture) {
        await queryRunner.addColumn(
          "users",
          new TableColumn({
            name: "profile_picture",
            type: "bytea",
            isNullable: true,
          })
        );
      }

      if (!hasAceptTerms) {
        await queryRunner.addColumn(
          "users",
          new TableColumn({
            name: "acept_terms",
            type: "boolean",
            isNullable: false,
            default: "false",
          })
        );
      }
    }

    // Limit profile_picture to 5MB
    await queryRunner.query(`
      DO $$
      BEGIN
        IF to_regclass('public.users') IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM pg_constraint WHERE conname = 'CHK_users_profile_picture_5mb'
           ) THEN
          ALTER TABLE "users"
          ADD CONSTRAINT "CHK_users_profile_picture_5mb"
          CHECK ("profile_picture" IS NULL OR octet_length("profile_picture") <= 5242880);
        END IF;
      END$$;
    `);

    // -------------------- companies --------------------
    const hasCompanies = await queryRunner.hasTable("companies");
    if (hasCompanies) {
      const companiesTable = await queryRunner.getTable("companies");
      const hasCompanyPicture = !!companiesTable?.findColumnByName("company_picture");

      if (!hasCompanyPicture) {
        await queryRunner.addColumn(
          "companies",
          new TableColumn({
            name: "company_picture",
            type: "bytea",
            isNullable: true,
          })
        );
      }
    }

    // Limit company_picture to 5MB
    await queryRunner.query(`
      DO $$
      BEGIN
        IF to_regclass('public.companies') IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM pg_constraint WHERE conname = 'CHK_companies_company_picture_5mb'
           ) THEN
          ALTER TABLE "companies"
          ADD CONSTRAINT "CHK_companies_company_picture_5mb"
          CHECK ("company_picture" IS NULL OR octet_length("company_picture") <= 5242880);
        END IF;
      END$$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop constraints first
    await queryRunner.query(`ALTER TABLE "companies" DROP CONSTRAINT IF EXISTS "CHK_companies_company_picture_5mb"`);
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "CHK_users_profile_picture_5mb"`);

    // Drop columns
    if (await queryRunner.hasTable("companies")) {
      const companiesTable = await queryRunner.getTable("companies");
      if (companiesTable?.findColumnByName("company_picture")) {
        await queryRunner.dropColumn("companies", "company_picture");
      }
    }

    if (await queryRunner.hasTable("users")) {
      const usersTable = await queryRunner.getTable("users");
      if (usersTable?.findColumnByName("acept_terms")) {
        await queryRunner.dropColumn("users", "acept_terms");
      }
      if (usersTable?.findColumnByName("profile_picture")) {
        await queryRunner.dropColumn("users", "profile_picture");
      }
    }
  }
}
