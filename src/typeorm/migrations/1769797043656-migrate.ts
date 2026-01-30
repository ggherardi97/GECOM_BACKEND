import { MigrationInterface, QueryRunner, Table, TableColumn, TableForeignKey } from 'typeorm';

export class Migrate1769797043656 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'process_types',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'name',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      })
    );

    // Insert initial values
    await queryRunner.query(
      `INSERT INTO process_types (name) VALUES ('Export'), ('Import'), ('National')`
    );

    await queryRunner.addColumn(
      'processes',
      new TableColumn({
        name: 'process_type_id',
        type: 'uuid',
        isNullable: true,
      })
    );

    await queryRunner.createForeignKey(
      'processes',
      new TableForeignKey({
        columnNames: ['process_type_id'],
        referencedTableName: 'process_types',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('processes');
    if (!table) return;

    const foreignKey = table.foreignKeys.find(
      (fk) => fk.columnNames.indexOf('process_type_id') !== -1
    );
    if (foreignKey) {
      await queryRunner.dropForeignKey('processes', foreignKey);
    }
    await queryRunner.dropColumn('processes', 'process_type_id');
    await queryRunner.dropTable('process_types');
  }
}
