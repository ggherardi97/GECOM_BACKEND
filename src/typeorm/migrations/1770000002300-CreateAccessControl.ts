import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAccessControl1770000002300 implements MigrationInterface {
  name = 'CreateAccessControl1770000002300';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "access_roles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "name" varchar(120) NOT NULL,
        "code" varchar(80) NOT NULL,
        "description" text NULL,
        "is_system" boolean NOT NULL DEFAULT false,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz NULL,
        CONSTRAINT "PK_access_roles" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_access_roles_tenant_code"
      ON "access_roles" ("tenant_id", "code")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_access_roles_tenant_id"
      ON "access_roles" ("tenant_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_access_roles_tenant_active"
      ON "access_roles" ("tenant_id", "is_active")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "access_role_permissions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "role_id" uuid NOT NULL,
        "entity" varchar(120) NOT NULL,
        "can_read" boolean NOT NULL DEFAULT false,
        "can_create" boolean NOT NULL DEFAULT false,
        "can_update" boolean NOT NULL DEFAULT false,
        "can_delete" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_access_role_permissions" PRIMARY KEY ("id"),
        CONSTRAINT "fk_access_role_permissions_role"
          FOREIGN KEY ("role_id") REFERENCES "access_roles"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_access_role_permissions_tenant_role_entity"
      ON "access_role_permissions" ("tenant_id", "role_id", "entity")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_access_role_permissions_tenant_id"
      ON "access_role_permissions" ("tenant_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_access_role_permissions_tenant_entity"
      ON "access_role_permissions" ("tenant_id", "entity")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "access_user_roles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "role_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_access_user_roles" PRIMARY KEY ("id"),
        CONSTRAINT "fk_access_user_roles_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "fk_access_user_roles_role"
          FOREIGN KEY ("role_id") REFERENCES "access_roles"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_access_user_roles_tenant_user_role"
      ON "access_user_roles" ("tenant_id", "user_id", "role_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_access_user_roles_tenant_user"
      ON "access_user_roles" ("tenant_id", "user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_access_user_roles_tenant_role"
      ON "access_user_roles" ("tenant_id", "role_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "access_user_roles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "access_role_permissions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "access_roles"`);
  }
}
