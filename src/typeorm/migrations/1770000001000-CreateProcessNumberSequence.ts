import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProcessNumberSequence1770000001000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE
        max_proc BIGINT;
        seq_last BIGINT;
      BEGIN
        CREATE SEQUENCE IF NOT EXISTS process_number_seq START 1 INCREMENT 1;

        SELECT COALESCE(
          MAX(
            CASE
              WHEN process_number ~ '^PROC-[0-9]+$'
              THEN regexp_replace(process_number, '^PROC-', '')::BIGINT
              ELSE NULL
            END
          ),
          0
        )
        INTO max_proc
        FROM processes;

        SELECT last_value INTO seq_last FROM process_number_seq;

        IF max_proc = 0 AND seq_last <= 1 THEN
          PERFORM setval('process_number_seq', 1, false);
        ELSE
          PERFORM setval('process_number_seq', GREATEST(max_proc, seq_last), true);
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP SEQUENCE IF EXISTS process_number_seq;`);
  }
}
