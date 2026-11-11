// Run against an isolated PostgreSQL database only, after npm run build.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');
const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const { ConfigService } = require('@nestjs/config');
const { JwtModule, JwtService } = require('@nestjs/jwt');
const { PassportModule } = require('@nestjs/passport');
const { APP_GUARD } = require('@nestjs/core');
const { PrismaService } = require('../dist/prisma/prisma.service');
const { JwtAuthGuard } = require('../dist/modules/auth/guards/jwt-auth.guard');
const { JwtStrategy } = require('../dist/modules/auth/strategies/jwt.strategy');
const { TenantInterceptor } = require('../dist/common/tenant/tenant.interceptor');
const { runWithTenant } = require('../dist/common/tenant/tenant-context');
const {
  CreateFlyChecker1790553600000,
} = require('../dist/typeorm/migrations/1790553600000-CreateFlyChecker');
const { FlyCheckerController } = require('../dist/modules/fly-checker/fly-checker.controller');
const { FlyCheckerService } = require('../dist/modules/fly-checker/fly-checker.service');
const { FlyCheckerRepository } = require('../dist/modules/fly-checker/fly-checker.repository');
const { FlyCheckerScheduler } = require('../dist/modules/fly-checker/fly-checker.scheduler');
const { OpportunityService } = require('../dist/modules/fly-checker/opportunity.service');
const { MailerService } = require('../dist/modules/mailer/mailer.service');
const { FLIGHT_PROVIDER } = require('../dist/modules/fly-checker/fly-checker.types');

async function main() {
  const url = new URL(process.env.FLY_CHECKER_TEST_DATABASE_URL || '');
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.pathname, '/flychecker_test');
  process.env.DATABASE_URL = url.toString();
  process.env.JWT_SECRET = randomUUID();
  const pool = new Pool({ connectionString: url.toString() });
  const migration = new CreateFlyChecker1790553600000();
  let app, prisma;
  try {
    await pool.query(
      'CREATE TABLE IF NOT EXISTS tenants(id uuid PRIMARY KEY); CREATE TABLE IF NOT EXISTS users(id uuid PRIMARY KEY)'
    );
    await migration.up({ query: (sql) => pool.query(sql) });
    const tenantA = randomUUID(),
      tenantB = randomUUID(),
      userA = randomUUID(),
      userB = randomUUID(),
      userC = randomUUID();
    await pool.query('INSERT INTO tenants VALUES ($1),($2)', [tenantA, tenantB]);
    await pool.query('INSERT INTO users VALUES ($1),($2),($3)', [userA, userB, userC]);
    const scope = { tenantId: tenantA, userId: userA };
    let price = '4850.00',
      mode = 'ok';
    const sent = [];
    const flightProvider = {
      name: 'serpapi',
      environment: 'production',
      configured: () => true,
      search: async (q) => {
        if (mode === 'error') throw new Error('SerpApi: HTTP 429');
        if (mode === 'empty') return [];
        return [
          {
            fingerprint: 'stable-fare',
            price,
            currency: 'BRL',
            departure_date: q.departure,
            return_date: q.returning,
            airline: 'Example airline',
            itinerary: [],
            fare_details: [],
          },
        ];
      },
    };
    const moduleRef = await Test.createTestingModule({
      imports: [PassportModule, JwtModule.register({ secret: process.env.JWT_SECRET })],
      controllers: [FlyCheckerController],
      providers: [
        PrismaService,
        FlyCheckerRepository,
        FlyCheckerService,
        OpportunityService,
        JwtStrategy,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: ConfigService, useValue: new ConfigService() },
        { provide: FlyCheckerScheduler, useValue: { kick() {} } },
        { provide: FLIGHT_PROVIDER, useValue: flightProvider },
        {
          provide: MailerService,
          useValue: {
            async sendFlyCheckerEmail(email) {
              sent.push(email);
            },
          },
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
    );
    app.useGlobalInterceptors(new TenantInterceptor());
    await app.listen(0, '127.0.0.1');
    prisma = moduleRef.get(PrismaService);
    const service = moduleRef.get(FlyCheckerService),
      repo = moduleRef.get(FlyCheckerRepository),
      jwt = moduleRef.get(JwtService);
    const base = await app.getUrl();
    const tokenA = jwt.sign({ sub: userA, tenant_id: tenantA });
    const tokenB = jwt.sign({ sub: userB, tenant_id: tenantA });
    const tokenC = jwt.sign({ sub: userC, tenant_id: tenantB });
    async function request(path, token = tokenA, method = 'GET', body) {
      return fetch(base + '/fly-checker/' + path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    }
    assert.equal((await request('searches', '')).status, 401);
    const future = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
    const payload = {
      origin: 'GRU',
      destination: 'NYC',
      departure_start: future(10),
      departure_end: future(10),
      return_start: future(20),
      return_end: future(20),
      max_price: '3500.00',
      email: 'test@example.test',
      non_stop: true,
    };
    assert.equal(
      (await request('searches', tokenA, 'POST', { ...payload, tenant_id: tenantB })).status,
      400
    );
    const created = await request('searches', tokenA, 'POST', payload);
    assert.equal(created.status, 201);
    const search = await created.json();
    assert.equal(search.user_id, userA);
    assert.equal(search.tenant_id, tenantA);
    assert.equal((await request('searches/' + search.id, tokenB)).status, 404);
    assert.equal((await request('searches/' + search.id, tokenC)).status, 404);
    assert.equal(
      (await request('searches/' + search.id, tokenB, 'PATCH', { email: 'intruder@example.test' }))
        .status,
      404
    );
    assert.deepEqual(await (await request('searches', tokenB)).json(), []);
    const owned = (fn) => runWithTenant(tenantA, fn, userA);
    async function runCheck() {
      await owned(() =>
        prisma.raw.fly_checker_searches.updateMany({
          where: { id: search.id, tenant_id: tenantA },
          data: { next_check_at: new Date(0) },
        })
      );
      await owned(() => service.process(scope, search.id));
    }
    await runCheck();
    assert.equal(sent.length, 0);
    price = '3150.00';
    await runCheck();
    assert.equal(sent.length, 1);
    assert.match(sent[0].text, /Novo menor preço/);
    await runCheck();
    assert.equal(sent.length, 1, 'same fare must not notify again');
    price = '2900.00';
    await runCheck();
    assert.equal(sent.length, 2, 'relevant improvement should notify');
    mode = 'error';
    await runCheck();
    mode = 'empty';
    await runCheck();
    assert.equal(sent.length, 2);
    const detail = await (await request('searches/' + search.id)).json();
    assert.equal(detail.total, 6);
    assert.equal(detail.stats.low, 2900);
    assert.equal(detail.stats.samples, 4);
    assert.equal(detail.checks[0].status, 'empty');
    assert.equal(detail.checks[0].min_price, null);
    assert.equal(detail.checks[1].status, 'error');
    assert.equal(detail.alerts.length, 2);
    // Compare simultaneous claims in real PostgreSQL, not mocks.
    await owned(() =>
      prisma.raw.fly_checker_searches.updateMany({
        where: { id: search.id, tenant_id: tenantA },
        data: { next_check_at: new Date(0) },
      })
    );
    const claims = await owned(() =>
      Promise.all([repo.claim(scope, search.id, 30), repo.claim(scope, search.id, 30)])
    );
    assert.equal(claims.filter(Boolean).length, 1);
    assert.equal(
      (await request('searches/' + search.id, tokenA, 'PATCH', { active: false })).status,
      200
    );
    const claim = claims.find(Boolean);
    await owned(() => repo.release(claim.search, claim.token));
    assert.equal(
      (await request('searches/' + search.id, tokenA, 'PATCH', { active: false })).status,
      200
    );
    assert.equal(
      (await request('searches/' + search.id + '/check', tokenA, 'POST', {})).status,
      400
    );
    assert.equal(await owned(() => repo.claim(scope, search.id, 180)), null);
    assert.equal((await request('searches/' + search.id, tokenB, 'DELETE')).status, 404);
    assert.equal((await request('searches/' + search.id, tokenC, 'DELETE')).status, 404);
    // Delete even while a worker owns a lease: all children must cascade and the worker must stop.
    await owned(() =>
      prisma.raw.fly_checker_searches.updateMany({
        where: { id: search.id, tenant_id: tenantA },
        data: { active: true, next_check_at: new Date(0) },
      })
    );
    const deletingClaim = await owned(() => repo.claim(scope, search.id, 180));
    assert.ok(deletingClaim);
    assert.equal((await request('searches/' + search.id, tokenA, 'DELETE')).status, 200);
    assert.equal(
      await owned(() => repo.ownsLease(deletingClaim.search, deletingClaim.token)),
      false
    );
    assert.equal((await request('searches/' + search.id)).status, 404);
    for (const table of [
      'fly_checker_searches',
      'fly_checker_checks',
      'fly_checker_prices',
      'fly_checker_alerts',
    ]) {
      assert.equal(Number((await pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count), 0);
    }
    console.log(
      'PASS: PostgreSQL migration, JWT auth, validation, tenant/owner isolation, history, alerts, deduplication, price improvement, errors, empty results, concurrent claims, pause during processing, scoped deletion with cascade.'
    );
    await app.close();
    app = null;
    await migration.down({ query: (sql) => pool.query(sql) });
    console.log('PASS: migration rollback in isolated database.');
  } finally {
    if (app) await app.close();
    await pool.end();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
