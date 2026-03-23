import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateIncidentNumberSequence1770000003200 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE
        max_inc BIGINT;
        seq_last BIGINT;
      BEGIN
        CREATE SEQUENCE IF NOT EXISTS incident_number_seq START 1 INCREMENT 1;

        SELECT COALESCE(
          MAX(
            CASE
              WHEN number ~ '^INC-[0-9]+$'
              THEN regexp_replace(number, '^INC-', '')::BIGINT
              ELSE NULL
            END
          ),
          0
        )
        INTO max_inc
        FROM incidents;

        SELECT last_value INTO seq_last FROM incident_number_seq;

        IF max_inc = 0 AND seq_last <= 1 THEN
          PERFORM setval('incident_number_seq', 1, false);
        ELSE
          PERFORM setval('incident_number_seq', GREATEST(max_inc, seq_last), true);
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE incidents
      ALTER COLUMN number SET DEFAULT '';

      CREATE OR REPLACE FUNCTION set_incident_number()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.number IS NULL OR length(trim(NEW.number)) = 0 THEN
          NEW.number := 'INC-' || lpad(nextval('incident_number_seq')::text, 6, '0');
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_incidents_set_number ON incidents;
      CREATE TRIGGER trg_incidents_set_number
      BEFORE INSERT ON incidents
      FOR EACH ROW EXECUTE FUNCTION set_incident_number();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_incidents_set_number ON incidents;
      DROP FUNCTION IF EXISTS set_incident_number();
      ALTER TABLE incidents ALTER COLUMN number DROP DEFAULT;
      DROP SEQUENCE IF EXISTS incident_number_seq;
    `);
  }
}
