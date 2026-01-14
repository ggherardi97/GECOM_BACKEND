import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class Migrate1766749124290 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    /* =========================
       PROCESSES
    ========================== */
    await queryRunner.createTable(
      new Table({
        name: 'processes',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'process_number',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'status',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'invoice',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'company_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'primary_contact_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'ship_date',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'completed',
            type: 'int',
            default: 0,
          },
          {
            name: 'created_on',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'deleted_at',
            type: 'timestamp',
            isNullable: true,
          },
        ],
      })
    );

    await queryRunner.createForeignKeys('processes', [
      new TableForeignKey({
        columnNames: ['company_id'],
        referencedTableName: 'companies',
        referencedColumnNames: ['id'],
        onDelete: 'RESTRICT',
      }),
      new TableForeignKey({
        columnNames: ['primary_contact_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'RESTRICT',
      }),
    ]);

    await queryRunner.createIndices('processes', [
      new TableIndex({
        name: 'IDX_PROCESS_PROCESS_NUMBER',
        columnNames: ['process_number'],
      }),
      new TableIndex({
        name: 'IDX_PROCESS_COMPANY_ID',
        columnNames: ['company_id'],
      }),
    ]);

    /* =========================
       EVENTS
    ========================== */
    await queryRunner.createTable(
      new Table({
        name: 'events',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'related_table',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'related_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'status',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'title',
            type: 'varchar',
            length: '150',
            isNullable: false,
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'type',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'start_time',
            type: 'timestamp',
            isNullable: false,
          },
          {
            name: 'end_time',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'finished',
            type: 'boolean',
            default: false,
          },
          {
            name: 'document_related',
            type: 'boolean',
            default: false,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      })
    );

    await queryRunner.createIndices('events', [
      new TableIndex({
        name: 'IDX_EVENTS_RELATED',
        columnNames: ['related_table', 'related_id'],
      }),
      new TableIndex({
        name: 'IDX_EVENTS_TYPE',
        columnNames: ['type'],
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('events');
    await queryRunner.dropTable('processes');
  }
}
