import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { setTimeout as delay } from 'node:timers/promises';
import { FlyCheckerRepository } from './fly-checker.repository';
import { CreateFlySearchDto, UpdateFlySearchDto } from './dto/search.dto';
import { dateOnly, datePairs } from './date-pairs';
import { FLIGHT_PROVIDER, settingNumber } from './fly-checker.types';
import type { FlightOffer, FlightProvider, Scope } from './fly-checker.types';
import { OpportunityService } from './opportunity.service';
import { MailerService } from '../mailer/mailer.service';
import { opportunityEmail } from './fly-checker-email';

@Injectable()
export class FlyCheckerService {
  private readonly logger = new Logger(FlyCheckerService.name);
  constructor(
    private readonly repo: FlyCheckerRepository,
    private readonly config: ConfigService,
    @Inject(FLIGHT_PROVIDER) private readonly provider: FlightProvider,
    private readonly opportunity: OpportunityService,
    private readonly mailer: MailerService
  ) {}
  get maxCombinations() {
    return Math.floor(
      settingNumber(
        this.config.get('FLY_CHECKER_MAX_COMBINATIONS'),
        this.provider.name === 'serpapi' ? 5 : 25,
        1,
        100
      )
    );
  }
  get interval() {
    return settingNumber(this.config.get('FLY_CHECKER_INTERVAL_MINUTES'), 180, 30, 1440);
  }
  get enabled() {
    return this.config.get('FLY_CHECKER_ENABLED', 'true') !== 'false';
  }
  status() {
    return {
      configured: this.provider.configured(),
      enabled: this.enabled,
      provider: this.provider.name,
      environment: this.provider.environment,
      interval_minutes: this.interval,
      max_combinations: this.maxCombinations,
      emails_enabled:
        this.provider.environment === 'production' ||
        this.config.get('FLY_CHECKER_TEST_EMAILS', 'false') === 'true',
    };
  }
  async create(scope: Scope, dto: CreateFlySearchDto) {
    if (dto.origin === dto.destination)
      throw new BadRequestException('Origem e destino devem ser diferentes.');
    if (Number(dto.max_price) <= 0)
      throw new BadRequestException('O preço máximo deve ser maior que zero.');
    if (dto.departure_start <= dateOnly(new Date()))
      throw new BadRequestException('A ida deve começar a partir de amanhã (UTC).');
    if (!datePairs(dto, this.maxCombinations).length)
      throw new BadRequestException('Nenhuma combinação futura válida.');
    if ((await this.repo.count(scope)) >= 20)
      throw new BadRequestException(
        'Limite de 20 buscas ativas. Pause uma busca antes de cadastrar outra.'
      );
    return this.repo.create(scope, {
      ...dto,
      departure_start: new Date(dto.departure_start),
      departure_end: new Date(dto.departure_end),
      return_start: new Date(dto.return_start),
      return_end: new Date(dto.return_end),
    });
  }
  list(scope: Scope, page: number) {
    return this.repo.list(scope, page);
  }
  detail(scope: Scope, id: string, page: number) {
    return this.repo.detail(scope, id, page, this.provider.environment, this.provider.name);
  }
  async update(scope: Scope, id: string, dto: UpdateFlySearchDto) {
    const row = await this.repo.own(scope, id);
    if (dto.max_price !== undefined && Number(dto.max_price) <= 0)
      throw new BadRequestException('O preço máximo deve ser maior que zero.');
    if (dto.active === true && !row.active) {
      if (!datePairs(row, this.maxCombinations).length)
        throw new BadRequestException('Esta busca já venceu. Cadastre novas datas.');
      if ((await this.repo.count(scope)) >= 20)
        throw new BadRequestException('Limite de 20 buscas ativas.');
    }
    if (dto.active === false) return this.repo.pause(scope, id, dto);
    return this.repo.update(scope, id, {
      ...dto,
      ...(dto.active === true && !row.active ? { next_check_at: new Date() } : {}),
    });
  }
  remove(scope: Scope, id: string) {
    return this.repo.remove(scope, id);
  }
  async queue(scope: Scope, id: string) {
    const row = await this.repo.own(scope, id);
    if (!this.enabled || !this.provider.configured())
      throw new ServiceUnavailableException(
        'Configure a chave do provedor de passagens e habilite a integração no backend para consultar.'
      );
    if (!row.active) throw new BadRequestException('Ative a busca antes de consultar.');
    if (!datePairs(row, this.maxCombinations).length)
      throw new BadRequestException('Busca vencida. Cadastre novas datas.');
    if (row.last_check_at && Date.now() - row.last_check_at.getTime() < 60000)
      throw new ConflictException('Aguarde ao menos um minuto entre consultas manuais.');
    await this.repo.update(scope, id, { next_check_at: new Date() });
    return { queued: true, message: 'Consulta agendada. O histórico será atualizado ao concluir.' };
  }
  async process(scope: Scope, id: string) {
    const claim = await this.repo.claim(scope, id, this.interval);
    if (!claim) return;
    const { search, token } = claim;
    let checkId: string | undefined;
    let finished = false;
    const beforeRequest = async () => {
      if (!this.enabled || !(await this.repo.ownsLease(search, token)))
        throw new Error('Monitoring stopped');
    };
    try {
      await beforeRequest();
      const pairs = datePairs(search, this.maxCombinations);
      if (!pairs.length) {
        // Release first: update applies the same edit lock as interactive requests.
        await this.repo.release(search, token);
        await this.repo.update(scope, id, { active: false });
        return;
      }
      const check = await this.repo.start(
        search,
        this.provider.name,
        this.provider.environment,
        pairs.length
      );
      checkId = check.id;
      const historical = await this.repo.stats(
        scope.tenantId,
        id,
        this.provider.environment,
        check.started_at,
        this.provider.name
      );
      const signal = AbortSignal.timeout(8 * 60000);
      const found = new Map<string, FlightOffer>();
      let completed = 0;
      let failure = '';
      for (const pair of pairs) {
        try {
          await beforeRequest();
          const offers = await this.provider.search(
            {
              ...pair,
              origin: search.origin,
              destination: search.destination,
              nonStop: search.non_stop,
            },
            signal,
            beforeRequest
          );
          for (const offer of offers)
            if (
              !found.has(offer.fingerprint) ||
              Number(offer.price) < Number(found.get(offer.fingerprint)!.price)
            )
              found.set(offer.fingerprint, offer);
          completed++;
          await delay(150, undefined, { signal });
        } catch (e) {
          failure =
            e instanceof Error && /^(Amadeus|SerpApi):/.test(e.message)
              ? e.message
              : 'Consulta interrompida por falha de conexão ou tempo limite.';
          // Stop on upstream errors to avoid exhausting a provider quota.
          break;
        }
      }
      await beforeRequest();
      const offers = [...found.values()].sort((a, b) => Number(a.price) - Number(b.price));
      const complete = completed === pairs.length;
      await this.repo.finish(
        scope.tenantId,
        check.id,
        complete ? (offers.length ? 'success' : 'empty') : completed ? 'partial' : 'error',
        offers,
        completed,
        failure
      );
      finished = true;
      // Partial coverage is visible in history but never used for opportunity statistics/alerts.
      if (!complete || !offers.length) return;
      const best = offers[0];
      const price = Number(best.price);
      const reasons = this.opportunity.evaluate(price, Number(search.max_price), historical);
      if (!reasons.length) return;
      const previous = await this.repo.alertHistory(
        search,
        this.provider.environment,
        best.fingerprint,
        this.provider.name
      );
      if (!this.opportunity.shouldNotify(price, previous.sameFareLow, previous.last)) return;
      if (!(await this.repo.ownsLease(search, token))) return;
      const alertId = await this.repo.reserveAlert(
        {
          tenant_id: scope.tenantId,
          search_id: id,
          check_id: check.id,
          fingerprint: best.fingerprint,
          price: best.price,
          environment: this.provider.environment,
          provider: this.provider.name,
          reasons,
          average_price: historical.average,
          previous_low: historical.low,
          email: search.email,
          status: 'pending',
        },
        !this.status().emails_enabled
      );
      if (!alertId) return;
      if (!(await this.repo.ownsLease(search, token))) {
        await this.repo.markAlert(scope.tenantId, alertId, 'cancelled');
        return;
      }
      try {
        await this.mailer.sendFlyCheckerEmail(
          opportunityEmail(
            search,
            best,
            reasons,
            historical,
            this.config.get('FLY_CHECKER_PUBLIC_URL', 'https://convert-plus.com'),
            this.provider.environment !== 'production'
          )
        );
      } catch {
        await this.repo.markAlert(
          scope.tenantId,
          alertId,
          'failed',
          'Falha no envio de e-mail. Confira a configuração SMTP do backend.'
        );
        return;
      }
      // If recording fails after SMTP succeeds, leave "sending" for crash recovery as "uncertain".
      await this.repo.markAlert(scope.tenantId, alertId, 'sent');
    } catch {
      if (!(await this.repo.ownsLease(search, token))) {
        await this.repo.cancelRunning(search, token);
        return;
      }
      this.logger.error(`Falha ao processar busca FlyChecker ${id}.`);
      if (checkId && !finished)
        await this.repo.finish(
          scope.tenantId,
          checkId,
          'error',
          [],
          0,
          'Falha interna ao processar a consulta.'
        );
    } finally {
      await this.repo.release(search, token);
    }
  }
}
