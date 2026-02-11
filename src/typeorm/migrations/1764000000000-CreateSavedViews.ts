import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateSavedViews1764000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ============================================
    // Enums
    // ============================================

    await queryRunner.query(`
      DO $$
      BEGIN
        CREATE TYPE view_visibility_enum AS ENUM ('PRIVATE', 'SHARED', 'PUBLIC');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END$$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        CREATE TYPE view_source_enum AS ENUM ('MANUAL', 'AI');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END$$;
    `);

    // ============================================
    // saved_views
    // ============================================

    await queryRunner.createTable(
      new Table({
        name: 'saved_views',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'tenant_id',
            type: 'uuid',
          },
          {
            name: 'entity_name',
            type: 'varchar',
            length: '100',
          },
          {
            name: 'name',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'owner_user_id',
            type: 'uuid',
          },
          {
            name: 'visibility',
            type: 'view_visibility_enum',
            default: `'PRIVATE'`,
          },
          {
            name: 'shared_with_user_ids',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'shared_with_role_ids',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'definition_json',
            type: 'jsonb',
          },
          {
            name: 'is_system',
            type: 'boolean',
            default: false,
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
          },
          {
            name: 'source',
            type: 'view_source_enum',
            default: `'MANUAL'`,
          },
          {
            name: 'ai_prompt',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true
    );

    await queryRunner.createForeignKey(
      'saved_views',
      new TableForeignKey({
        columnNames: ['owner_user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'RESTRICT',
      })
    );

    await queryRunner.createIndex(
      'saved_views',
      new TableIndex({
        name: 'IDX_saved_views_tenant_entity',
        columnNames: ['tenant_id', 'entity_name'],
      })
    );

    await queryRunner.createIndex(
      'saved_views',
      new TableIndex({
        name: 'IDX_saved_views_owner',
        columnNames: ['owner_user_id'],
      })
    );

    // ============================================
    // user_default_views
    // ============================================

    await queryRunner.createTable(
      new Table({
        name: 'user_default_views',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'tenant_id',
            type: 'uuid',
          },
          {
            name: 'user_id',
            type: 'uuid',
          },
          {
            name: 'entity_name',
            type: 'varchar',
            length: '100',
          },
          {
            name: 'saved_view_id',
            type: 'uuid',
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
        uniques: [
          {
            name: 'UQ_user_default_views_user_entity',
            columnNames: ['tenant_id', 'user_id', 'entity_name'],
          },
        ],
      }),
      true
    );

    await queryRunner.createForeignKeys('user_default_views', [
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
      new TableForeignKey({
        columnNames: ['saved_view_id'],
        referencedTableName: 'saved_views',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('user_default_views');
    await queryRunner.dropTable('saved_views');

    await queryRunner.query(`DROP TYPE IF EXISTS view_source_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS view_visibility_enum`);
  }
}