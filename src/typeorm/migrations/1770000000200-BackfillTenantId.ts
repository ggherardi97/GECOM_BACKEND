import { MigrationInterface, QueryRunner } from "typeorm";

export class BackfillTenantId1770000000200 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const fallbackTenantId = "2f1803b2-4b33-4f86-8fb5-484f67472705";

    const tenantRows: Array<{ id: string }> = await queryRunner.query(
      `SELECT id FROM tenants WHERE id = $1 AND deleted_at IS NULL`,
      [fallbackTenantId]
    );

    let resolvedFallbackTenantId: string | null = tenantRows?.[0]?.id ?? null;

    if (!resolvedFallbackTenantId) {
      const anyTenantRows: Array<{ id: string }> = await queryRunner.query(
        `SELECT id FROM tenants WHERE deleted_at IS NULL ORDER BY created_at ASC LIMIT 1`
      );
      resolvedFallbackTenantId = anyTenantRows?.[0]?.id ?? null;
    }

    if (!resolvedFallbackTenantId) {
      // eslint-disable-next-line no-console
      console.warn(
        `[BackfillTenantId] No fallback tenant found. Rows without deterministic tenant relation may remain NULL in this step.`
      );
    }

    // ---------------- companies ----------------
    // 1) If a company is the root company of a tenant, set that tenant_id
    await queryRunner.query(`
      UPDATE companies c
      SET tenant_id = t.id
      FROM tenants t
      WHERE c.tenant_id IS NULL
        AND t.company_id = c.id
        AND t.deleted_at IS NULL
    `);

    // 2) Remaining companies -> fallback tenant
    if (resolvedFallbackTenantId) {
      await queryRunner.query(
        `
        UPDATE companies
        SET tenant_id = $1
        WHERE tenant_id IS NULL
      `,
        [resolvedFallbackTenantId]
      );
    }

    // ---------------- users ----------------
    // Prefer company tenant
    await queryRunner.query(`
      UPDATE users u
      SET tenant_id = c.tenant_id
      FROM companies c
      WHERE u.tenant_id IS NULL
        AND u.company_id IS NOT NULL
        AND c.id = u.company_id
        AND c.tenant_id IS NOT NULL
    `);

    // Remaining -> fallback
    if (resolvedFallbackTenantId) {
      await queryRunner.query(
        `
        UPDATE users
        SET tenant_id = $1
        WHERE tenant_id IS NULL
      `,
        [resolvedFallbackTenantId]
      );
    }

    // ---------------- invoices ----------------
    await queryRunner.query(`
      UPDATE invoices i
      SET tenant_id = c.tenant_id
      FROM companies c
      WHERE i.tenant_id IS NULL
        AND c.id = i.company_id
        AND c.tenant_id IS NOT NULL
    `);

    if (resolvedFallbackTenantId) {
      await queryRunner.query(
        `
        UPDATE invoices
        SET tenant_id = $1
        WHERE tenant_id IS NULL
      `,
        [resolvedFallbackTenantId]
      );
    }

    // ---------------- invoice_lines ----------------
    await queryRunner.query(`
      UPDATE invoice_lines il
      SET tenant_id = i.tenant_id
      FROM invoices i
      WHERE il.tenant_id IS NULL
        AND i.id = il.invoice_id
        AND i.tenant_id IS NOT NULL
    `);

    if (resolvedFallbackTenantId) {
      await queryRunner.query(
        `
        UPDATE invoice_lines
        SET tenant_id = $1
        WHERE tenant_id IS NULL
      `,
        [resolvedFallbackTenantId]
      );
    }

    // ---------------- processes ----------------
    await queryRunner.query(`
      UPDATE processes p
      SET tenant_id = c.tenant_id
      FROM companies c
      WHERE p.tenant_id IS NULL
        AND c.id = p.company_id
        AND c.tenant_id IS NOT NULL
    `);

    if (resolvedFallbackTenantId) {
      await queryRunner.query(
        `
        UPDATE processes
        SET tenant_id = $1
        WHERE tenant_id IS NULL
      `,
        [resolvedFallbackTenantId]
      );
    }

    // ---------------- transports ----------------
    await queryRunner.query(`
      UPDATE transports t
      SET tenant_id = p.tenant_id
      FROM processes p
      WHERE t.tenant_id IS NULL
        AND p.id = t.process_id
        AND p.tenant_id IS NOT NULL
    `);

    if (resolvedFallbackTenantId) {
      await queryRunner.query(
        `
        UPDATE transports
        SET tenant_id = $1
        WHERE tenant_id IS NULL
      `,
        [resolvedFallbackTenantId]
      );
    }

    // ---------------- documents ----------------
    await queryRunner.query(`
      UPDATE documents d
      SET tenant_id = c.tenant_id
      FROM companies c
      WHERE d.tenant_id IS NULL
        AND c.id = d.account_id
        AND c.tenant_id IS NOT NULL
    `);

    if (resolvedFallbackTenantId) {
      await queryRunner.query(
        `
        UPDATE documents
        SET tenant_id = $1
        WHERE tenant_id IS NULL
      `,
        [resolvedFallbackTenantId]
      );
    }

    // ---------------- products ----------------
    // Products currently have no ownership pointer, so we attach to fallback tenant
    if (resolvedFallbackTenantId) {
      await queryRunner.query(
        `
        UPDATE products
        SET tenant_id = $1
        WHERE tenant_id IS NULL
      `,
        [resolvedFallbackTenantId]
      );
    }

    // ---------------- sessions ----------------
    await queryRunner.query(`
      UPDATE sessions s
      SET tenant_id = u.tenant_id
      FROM users u
      WHERE s.tenant_id IS NULL
        AND u.id = s.user_id
        AND u.tenant_id IS NOT NULL
    `);

    if (resolvedFallbackTenantId) {
      await queryRunner.query(
        `
        UPDATE sessions
        SET tenant_id = $1
        WHERE tenant_id IS NULL
      `,
        [resolvedFallbackTenantId]
      );
    }

    // ---------------- password_resets ----------------
    await queryRunner.query(`
      UPDATE password_resets pr
      SET tenant_id = u.tenant_id
      FROM users u
      WHERE pr.tenant_id IS NULL
        AND u.id = pr.user_id
        AND u.tenant_id IS NOT NULL
    `);

    if (resolvedFallbackTenantId) {
      await queryRunner.query(
        `
        UPDATE password_resets
        SET tenant_id = $1
        WHERE tenant_id IS NULL
      `,
        [resolvedFallbackTenantId]
      );
    }

    // ---------------- events ----------------
    // Try to infer tenant by related_table
    await queryRunner.query(`
      UPDATE events e
      SET tenant_id = c.tenant_id
      FROM companies c
      WHERE e.tenant_id IS NULL
        AND e.related_table = 'companies'
        AND c.id = e.related_id
        AND c.tenant_id IS NOT NULL
    `);

    await queryRunner.query(`
      UPDATE events e
      SET tenant_id = p.tenant_id
      FROM processes p
      WHERE e.tenant_id IS NULL
        AND e.related_table = 'processes'
        AND p.id = e.related_id
        AND p.tenant_id IS NOT NULL
    `);

    await queryRunner.query(`
      UPDATE events e
      SET tenant_id = i.tenant_id
      FROM invoices i
      WHERE e.tenant_id IS NULL
        AND e.related_table = 'invoices'
        AND i.id = e.related_id
        AND i.tenant_id IS NOT NULL
    `);

    await queryRunner.query(`
      UPDATE events e
      SET tenant_id = d.tenant_id
      FROM documents d
      WHERE e.tenant_id IS NULL
        AND e.related_table = 'documents'
        AND d.id = e.related_id
        AND d.tenant_id IS NOT NULL
    `);

    // Remaining -> fallback
    if (resolvedFallbackTenantId) {
      await queryRunner.query(
        `
        UPDATE events
        SET tenant_id = $1
        WHERE tenant_id IS NULL
      `,
        [resolvedFallbackTenantId]
      );
    }

    // ---------------- Sanity check ----------------
    const nullCounts = await queryRunner.query(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE tenant_id IS NULL)           AS users_null,
        (SELECT COUNT(*) FROM companies WHERE tenant_id IS NULL)       AS companies_null,
        (SELECT COUNT(*) FROM processes WHERE tenant_id IS NULL)       AS processes_null,
        (SELECT COUNT(*) FROM transports WHERE tenant_id IS NULL)      AS transports_null,
        (SELECT COUNT(*) FROM invoices WHERE tenant_id IS NULL)        AS invoices_null,
        (SELECT COUNT(*) FROM invoice_lines WHERE tenant_id IS NULL)   AS invoice_lines_null,
        (SELECT COUNT(*) FROM products WHERE tenant_id IS NULL)        AS products_null,
        (SELECT COUNT(*) FROM documents WHERE tenant_id IS NULL)       AS documents_null,
        (SELECT COUNT(*) FROM events WHERE tenant_id IS NULL)          AS events_null,
        (SELECT COUNT(*) FROM sessions WHERE tenant_id IS NULL)        AS sessions_null,
        (SELECT COUNT(*) FROM password_resets WHERE tenant_id IS NULL) AS password_resets_null
    `);

    // eslint-disable-next-line no-console
    console.log("[BackfillTenantId] NULL tenant_id counts:", nullCounts?.[0] ?? nullCounts);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Intentionally empty (unsafe to revert without snapshot strategy).
  }
}
