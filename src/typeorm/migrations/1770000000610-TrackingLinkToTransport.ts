import { MigrationInterface, QueryRunner } from 'typeorm';

export class TrackingLinkToTransport1770000000610 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'tracking_links' AND column_name = 'transport_id'
  ) THEN
    ALTER TABLE tracking_links ADD COLUMN transport_id uuid NULL;
  END IF;
END$$;
`);

    await queryRunner.query(`
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'tracking_links' AND column_name = 'process_id'
  ) THEN
    UPDATE tracking_links tl
    SET transport_id = sub.transport_id
    FROM (
      SELECT x.id AS tracking_link_id, t.id AS transport_id
      FROM tracking_links x
      JOIN LATERAL (
        SELECT tr.id
        FROM transports tr
        WHERE tr.tenant_id = x.tenant_id
          AND tr.process_id = x.process_id
        ORDER BY tr.created_at ASC, tr.id ASC
        LIMIT 1
      ) t ON true
    ) sub
    WHERE tl.id = sub.tracking_link_id
      AND tl.transport_id IS NULL;
  END IF;
END$$;
`);

    await queryRunner.query(`DELETE FROM tracking_links WHERE transport_id IS NULL`);

    await queryRunner.query(`ALTER TABLE tracking_links DROP CONSTRAINT IF EXISTS uq_tracking_links_tenant_process`);
    await queryRunner.query(`ALTER TABLE tracking_links DROP CONSTRAINT IF EXISTS fk_tracking_links_process`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_tracking_links_process`);

    await queryRunner.query(`
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'tracking_links' AND column_name = 'transport_id' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE tracking_links ALTER COLUMN transport_id SET NOT NULL;
  END IF;
END$$;
`);

    await queryRunner.query(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_tracking_links_transport'
  ) THEN
    ALTER TABLE tracking_links
      ADD CONSTRAINT fk_tracking_links_transport
      FOREIGN KEY (transport_id) REFERENCES transports(id)
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END$$;
`);

    await queryRunner.query(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_tracking_links_tenant_transport'
  ) THEN
    ALTER TABLE tracking_links
      ADD CONSTRAINT uq_tracking_links_tenant_transport UNIQUE (tenant_id, transport_id);
  END IF;
END$$;
`);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_tracking_links_transport ON tracking_links (transport_id)`);

    await queryRunner.query(`
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'tracking_links' AND column_name = 'process_id'
  ) THEN
    ALTER TABLE tracking_links DROP COLUMN process_id;
  END IF;
END$$;
`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'tracking_links' AND column_name = 'process_id'
  ) THEN
    ALTER TABLE tracking_links ADD COLUMN process_id uuid NULL;
  END IF;
END$$;
`);

    await queryRunner.query(`
UPDATE tracking_links tl
SET process_id = tr.process_id
FROM transports tr
WHERE tr.id = tl.transport_id
  AND tl.process_id IS NULL;
`);

    await queryRunner.query(`DELETE FROM tracking_links WHERE process_id IS NULL`);

    await queryRunner.query(`ALTER TABLE tracking_links DROP CONSTRAINT IF EXISTS uq_tracking_links_tenant_transport`);
    await queryRunner.query(`ALTER TABLE tracking_links DROP CONSTRAINT IF EXISTS fk_tracking_links_transport`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_tracking_links_transport`);

    await queryRunner.query(`
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'tracking_links' AND column_name = 'process_id' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE tracking_links ALTER COLUMN process_id SET NOT NULL;
  END IF;
END$$;
`);

    await queryRunner.query(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_tracking_links_process'
  ) THEN
    ALTER TABLE tracking_links
      ADD CONSTRAINT fk_tracking_links_process
      FOREIGN KEY (process_id) REFERENCES processes(id)
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END$$;
`);

    await queryRunner.query(`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_tracking_links_tenant_process'
  ) THEN
    ALTER TABLE tracking_links
      ADD CONSTRAINT uq_tracking_links_tenant_process UNIQUE (tenant_id, process_id);
  END IF;
END$$;
`);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_tracking_links_process ON tracking_links (process_id)`);

    await queryRunner.query(`
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'tracking_links' AND column_name = 'transport_id'
  ) THEN
    ALTER TABLE tracking_links DROP COLUMN transport_id;
  END IF;
END$$;
`);
  }
}
