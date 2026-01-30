import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class Migrate1769800203149 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'transport_types',
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

    await queryRunner.query(
      `INSERT INTO transport_types (name) VALUES ('Aéreo'), ('Marítimo'), ('Terrestre');`
    );
    await queryRunner.createTable(
      new Table({
        name: 'transport_statuses',
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

    await queryRunner.query(
      `INSERT INTO transport_statuses (name) VALUES 
      ('Aguardando Embarque'), 
      ('Em Trânsito'), 
      ('Atrasado'), 
      ('Cancelado'), 
      ('Concluído'), 
      ('Próximo da Entrega')`
    );

    await queryRunner.createTable(
      new Table({
        name: 'transports',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'transport_company',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'origin',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'destination',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'contact_phone',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'transport_type_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'departure_forecast',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'arrival_forecast',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'transit_time',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'transport_status_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'process_id',
            type: 'uuid',
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

    await queryRunner.createForeignKeys('transports', [
      new TableForeignKey({
        columnNames: ['transport_type_id'],
        referencedTableName: 'transport_types',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
      new TableForeignKey({
        columnNames: ['transport_status_id'],
        referencedTableName: 'transport_statuses',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
      new TableForeignKey({
        columnNames: ['process_id'],
        referencedTableName: 'processes',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('transports');
    await queryRunner.dropTable('transport_statuses');
    await queryRunner.dropTable('transport_types');
  }
}
