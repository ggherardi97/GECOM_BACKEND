import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { runWithTenant } from '../../common/tenant/tenant-context';
import { FlyCheckerRepository } from './fly-checker.repository';
import { FlyCheckerService } from './fly-checker.service';

@Injectable()
export class FlyCheckerScheduler {
  private running = false;
  private readonly logger = new Logger(FlyCheckerScheduler.name);
  constructor(
    private readonly repo: FlyCheckerRepository,
    private readonly service: FlyCheckerService
  ) {}
  // Poll lightweight due timestamps every minute; each search defaults to every 3 hours.
  @Cron('0 * * * * *', { name: 'fly-checker', waitForCompletion: true })
  async tick() {
    if (this.running || !this.service.status().configured || !this.service.enabled) return;
    this.running = true;
    try {
      for (const row of await this.repo.due()) {
        try {
          await runWithTenant(
            row.tenant_id,
            () => this.service.process({ tenantId: row.tenant_id, userId: row.user_id }, row.id),
            row.user_id
          );
        } catch {
          this.logger.error(`Falha na execução FlyChecker ${row.id}.`);
        }
      }
    } catch {
      this.logger.error(
        'FlyChecker: não foi possível carregar as buscas pendentes. Verifique as migrações e o banco.'
      );
    } finally {
      this.running = false;
    }
  }
  kick() {
    setImmediate(() => void this.tick());
  }
}
