import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTracking1770000000600 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tracking_provider_enum') THEN
    CREATE TYPE tracking_provider_enum AS ENUM ('FR24', 'MARINETRAFFIC');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tracking_mode_enum') THEN
    CREATE TYPE tracking_mode_enum AS ENUM ('AIR', 'SEA');
  END IF;
END$$;
`);

    await queryRunner.query(`
CREATE TABLE IF NOT EXISTS tracking_configs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL,
  provider tracking_provider_enum NOT NULL,
  api_key varchar(500) NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

    await queryRunner.query(`
CREATE TABLE IF NOT EXISTS tracking_links (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL,
  transport_id uuid NOT NULL,
  mode tracking_mode_enum NOT NULL,
  provider tracking_provider_enum NOT NULL,
  external_id varchar(120) NOT NULL,
  last_snapshot_json jsonb NULL,
  last_synced_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
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
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_tracking_configs_tenant_provider'
  ) THEN
    ALTER TABLE tracking_configs
      ADD CONSTRAINT uq_tracking_configs_tenant_provider UNIQUE (tenant_id, provider);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_tracking_links_tenant_transport'
  ) THEN
    ALTER TABLE tracking_links
      ADD CONSTRAINT uq_tracking_links_tenant_transport UNIQUE (tenant_id, transport_id);
  END IF;
END$$;
`);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_tracking_configs_tenant ON tracking_configs (tenant_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_tracking_links_tenant ON tracking_links (tenant_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_tracking_links_transport ON tracking_links (transport_id)`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_tracking_links_tenant_mode_provider ON tracking_links (tenant_id, mode, provider)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_tracking_links_tenant_mode_provider`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_tracking_links_transport`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_tracking_links_tenant`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_tracking_configs_tenant`);

    await queryRunner.query(`ALTER TABLE tracking_links DROP CONSTRAINT IF EXISTS uq_tracking_links_tenant_transport`);
    await queryRunner.query(`ALTER TABLE tracking_configs DROP CONSTRAINT IF EXISTS uq_tracking_configs_tenant_provider`);
    await queryRunner.query(`ALTER TABLE tracking_links DROP CONSTRAINT IF EXISTS fk_tracking_links_transport`);

    await queryRunner.query(`DROP TABLE IF EXISTS tracking_links`);
    await queryRunner.query(`DROP TABLE IF EXISTS tracking_configs`);

    await queryRunner.query(`DROP TYPE IF EXISTS tracking_mode_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS tracking_provider_enum`);
  }
}
