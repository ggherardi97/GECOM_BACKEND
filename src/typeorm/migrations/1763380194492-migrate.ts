import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migrate1763380194492 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "user_role_enum"
      ADD VALUE IF NOT EXISTS 'CUSTOMER';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    /*
      ⚠️ IMPORTANTE:
      Postgres NÃO permite remover valores de enum.
      Para remover, seria necessário recriar o enum,
      mas isso quebra dados existentes.
      Portanto, este down não remove CUSTOMER.
    */

    console.log('Down migration for enum value CUSTOMER is not supported.');
  }
}
