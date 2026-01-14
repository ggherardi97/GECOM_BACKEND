import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddFieldsToCompanies1768000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('companies', [
      new TableColumn({
        name: 'address_postalcode',
        type: 'varchar',
        isNullable: true,
      }),
      new TableColumn({
        name: 'address_state',
        type: 'varchar',
        isNullable: true,
      }),
      new TableColumn({
        name: 'number_of_invoices',
        type: 'int',
        isNullable: false,
        default: 0,
      }),
      new TableColumn({
        name: 'language',
        type: 'varchar',
        isNullable: true,
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('companies', 'language');
    await queryRunner.dropColumn('companies', 'number_of_invoices');
    await queryRunner.dropColumn('companies', 'address_state');
    await queryRunner.dropColumn('companies', 'address_postalcode');
  }
}
