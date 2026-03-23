import { MigrationInterface, QueryRunner } from 'typeorm';

export class ServiceSchedulingAndIncidentWorkOrders1770000003300 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE service_resources
      ADD COLUMN IF NOT EXISTS can_receive_cases BOOLEAN NOT NULL DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS max_open_incidents INTEGER NULL,
      ADD COLUMN IF NOT EXISTS board_color VARCHAR(30) NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE po_work_orders
      ADD COLUMN IF NOT EXISTS incident_id UUID NULL;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'fk_po_work_orders_incident'
        ) THEN
          ALTER TABLE po_work_orders
          ADD CONSTRAINT fk_po_work_orders_incident
          FOREIGN KEY (incident_id) REFERENCES incidents(id)
          ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_po_work_orders_tenant_incident"
      ON "po_work_orders" ("tenant_id", "incident_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_po_work_orders_tenant_incident";`);
    await queryRunner.query(`ALTER TABLE po_work_orders DROP CONSTRAINT IF EXISTS fk_po_work_orders_incident;`);
    await queryRunner.query(`ALTER TABLE po_work_orders DROP COLUMN IF EXISTS incident_id;`);
    await queryRunner.query(`
      ALTER TABLE service_resources
      DROP COLUMN IF EXISTS board_color,
      DROP COLUMN IF EXISTS max_open_incidents,
      DROP COLUMN IF EXISTS can_receive_cases;
    `);
  }
}
