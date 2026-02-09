import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class Migrate1762950925401 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // -------------------- users --------------------
    await queryRunner.addColumn(
      "users",
      new TableColumn({
        name: "profile_picture",
        type: "bytea",
        isNullable: true,
      })
    );

    await queryRunner.addColumn(
      "users",
      new TableColumn({
        name: "acept_terms",
        type: "boolean",
        isNullable: false,
        default: "false",
      })
    );

    // Limit profile_picture to 5MB
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD CONSTRAINT "CHK_users_profile_picture_5mb"
      CHECK ("profile_picture" IS NULL OR octet_length("profile_picture") <= 5242880)
    `);

    // -------------------- companies --------------------
    await queryRunner.addColumn(
      "companies",
      new TableColumn({
        name: "company_picture",
        type: "bytea",
        isNullable: true,
      })
    );

    // Limit company_picture to 5MB
    await queryRunner.query(`
      ALTER TABLE "companies"
      ADD CONSTRAINT "CHK_companies_company_picture_5mb"
      CHECK ("company_picture" IS NULL OR octet_length("company_picture") <= 5242880)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop constraints first
    await queryRunner.query(`ALTER TABLE "companies" DROP CONSTRAINT IF EXISTS "CHK_companies_company_picture_5mb"`);
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "CHK_users_profile_picture_5mb"`);

    // Drop columns
    await queryRunner.dropColumn("companies", "company_picture");
    await queryRunner.dropColumn("users", "acept_terms");
    await queryRunner.dropColumn("users", "profile_picture");
  }
}
