import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFlyChecker1790553600000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE fly_checker_searches (
        id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id),
        user_id uuid NOT NULL REFERENCES users(id),
        origin varchar(3) NOT NULL, destination varchar(3) NOT NULL,
        departure_start date NOT NULL, departure_end date NOT NULL,
        return_start date NOT NULL, return_end date NOT NULL,
        max_price decimal(12,2) NOT NULL CHECK (max_price > 0),
        non_stop boolean NOT NULL DEFAULT false, email varchar(254) NOT NULL,
        active boolean NOT NULL DEFAULT true,
        next_check_at timestamptz NOT NULL DEFAULT now(), last_check_at timestamptz,
        locked_until timestamptz, lock_token uuid,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(id, tenant_id),
        CHECK (origin <> destination),
        CHECK (departure_start <= departure_end AND return_start <= return_end AND return_end > departure_start)
      );
      CREATE INDEX ON fly_checker_searches(tenant_id, user_id, created_at);
      CREATE INDEX ON fly_checker_searches(active, next_check_at);
      CREATE TABLE fly_checker_checks (
        id uuid PRIMARY KEY, tenant_id uuid NOT NULL, search_id uuid NOT NULL,
        provider varchar(40) NOT NULL, environment varchar(12) NOT NULL,
        status varchar(20) NOT NULL, started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
        combinations integer NOT NULL DEFAULT 0, completed_combinations integer NOT NULL DEFAULT 0,
        offer_count integer NOT NULL DEFAULT 0, min_price decimal(12,2), error_message varchar(500),
        UNIQUE(id, tenant_id),
        FOREIGN KEY(search_id, tenant_id) REFERENCES fly_checker_searches(id, tenant_id) ON DELETE CASCADE
      );
      CREATE INDEX ON fly_checker_checks(tenant_id, search_id, started_at);
      CREATE TABLE fly_checker_prices (
        id uuid PRIMARY KEY, tenant_id uuid NOT NULL, check_id uuid NOT NULL,
        fingerprint varchar(64) NOT NULL, price decimal(12,2) NOT NULL CHECK(price > 0),
        currency varchar(3) NOT NULL DEFAULT 'BRL', departure_date varchar(10) NOT NULL,
        return_date varchar(10) NOT NULL, airline varchar(255) NOT NULL,
        itinerary jsonb NOT NULL, fare_details jsonb NOT NULL, observed_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(check_id, fingerprint),
        FOREIGN KEY(check_id, tenant_id) REFERENCES fly_checker_checks(id, tenant_id) ON DELETE CASCADE
      );
      CREATE INDEX ON fly_checker_prices(tenant_id, check_id, price);
      CREATE TABLE fly_checker_alerts (
        id uuid PRIMARY KEY, tenant_id uuid NOT NULL, search_id uuid NOT NULL, check_id uuid NOT NULL,
        fingerprint varchar(64) NOT NULL, price decimal(12,2) NOT NULL,
        environment varchar(12) NOT NULL, provider varchar(40) NOT NULL, reasons jsonb NOT NULL, average_price decimal(12,2),
        previous_low decimal(12,2), email varchar(254) NOT NULL, status varchar(20) NOT NULL,
        attempts integer NOT NULL DEFAULT 0, error_message varchar(500),
        created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz,
        UNIQUE(search_id, provider, environment, fingerprint, price),
        FOREIGN KEY(search_id, tenant_id) REFERENCES fly_checker_searches(id, tenant_id) ON DELETE CASCADE,
        FOREIGN KEY(check_id, tenant_id) REFERENCES fly_checker_checks(id, tenant_id) ON DELETE CASCADE
      );
      CREATE INDEX ON fly_checker_alerts(tenant_id, search_id, sent_at);
    `);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(
      'DROP TABLE fly_checker_alerts, fly_checker_prices, fly_checker_checks, fly_checker_searches'
    );
  }
}
