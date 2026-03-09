import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantSubscriptionStatus } from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';

type SignupSessionInput = {
  signupPayload: Record<string, any>;
  selectedPlanId: string | null;
  customModuleIds: string[];
  planName: string;
  monthlyAmount: number;
  adminEmail: string;
  adminFullName?: string;
  companyName?: string;
  couponCode?: string;
};

type SignupStripeSubscriptionInput = {
  customerId: string;
  paymentMethodId: string;
  planId: string | null;
  planName: string;
  monthlyAmount: number;
  currency?: string;
  trialDays: number;
  metadata?: Record<string, string>;
};

type AttachTenantStripeInput = {
  tenantId: string;
  tenantSubscriptionId: string | null;
  planId: string | null;
  stripeCustomerId: string;
  stripeSubscription: Stripe.Subscription;
  stripePlanPriceId?: string | null;
  companyName?: string | null;
  adminEmail?: string | null;
};

@Injectable()
export class BillingStripeService {
  private stripeClient: Stripe | null = null;
  private stripeSecretCache: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
  ) {}

  isStripeConfigured(): boolean {
    return String(process.env.STRIPE_SECRET_KEY || '').trim().length > 0;
  }

  getPublishableKeyOrThrow(): string {
    const key = String(process.env.STRIPE_PUBLISHABLE_KEY || '').trim();
    if (!key) {
      throw new BadRequestException(
        'Stripe nao configurado: defina STRIPE_PUBLISHABLE_KEY no ambiente.',
      );
    }
    return key;
  }

  getTrialDays(): number {
    const raw = Number(process.env.BILLING_TRIAL_DAYS || 7);
    if (!Number.isFinite(raw)) return 7;
    return Math.max(1, Math.min(30, Math.trunc(raw)));
  }

  async createPublicSignupPaymentSession(input: SignupSessionInput) {
    const adminEmail = String(input.adminEmail || '').trim().toLowerCase();
    if (!adminEmail) {
      throw new BadRequestException('admin_email e obrigatorio para iniciar pagamento.');
    }

    const normalizedCouponCode = this.normalizeCoupon(input.couponCode);
    const isNeverPay = normalizedCouponCode === 'NEVERPAY';
    const trialDays = this.getTrialDays();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);
    const monthlyAmount = this.normalizeMoney(input.monthlyAmount);
    const currency = this.resolveCurrency();

    if (isNeverPay) {
      const bypassIntentId = `COUPON_NEVERPAY_${Date.now()}`.slice(0, 120);
      const savedBypassSession = await this.prisma.raw.public_signup_payment_sessions.create({
        data: {
          selected_plan_id: input.selectedPlanId,
          plan_name: String(input.planName || '').trim().slice(0, 255) || 'Plano',
          monthly_amount: monthlyAmount,
          currency,
          trial_days: trialDays,
          signup_payload_json: input.signupPayload as any,
          custom_module_ids_json: (input.customModuleIds || []) as any,
          admin_email: adminEmail,
          admin_full_name: String(input.adminFullName || '').trim() || null,
          company_name: String(input.companyName || '').trim() || null,
          stripe_customer_id: 'COUPON_NEVERPAY',
          stripe_setup_intent_id: bypassIntentId,
          stripe_setup_client_secret: null,
          setup_status: 'bypass_coupon',
          expires_at: expiresAt,
        } as any,
      });

      return {
        session_id: savedBypassSession.id,
        stripe_publishable_key: String(process.env.STRIPE_PUBLISHABLE_KEY || '').trim(),
        setup_intent_client_secret: null,
        requires_payment: false,
        trial_days: trialDays,
        plan_name: savedBypassSession.plan_name,
        monthly_amount: Number(savedBypassSession.monthly_amount || 0),
        currency: savedBypassSession.currency,
        expires_at: savedBypassSession.expires_at,
      };
    }

    const stripe = this.getStripeOrThrow();
    const customer = await stripe.customers.create({
      email: adminEmail,
      name: String(input.companyName || input.adminFullName || adminEmail).trim().slice(0, 200),
      metadata: {
        source: 'gecom_public_signup',
        plan_name: String(input.planName || '').slice(0, 120),
      },
    });

    const setupIntent = await stripe.setupIntents.create({
      customer: customer.id,
      usage: 'off_session',
      payment_method_types: ['card'],
      metadata: {
        source: 'gecom_public_signup',
        admin_email: adminEmail,
      },
    });
    if (!setupIntent.client_secret) {
      throw new BadRequestException('Nao foi possivel iniciar sessao de cartao no Stripe.');
    }

    const saved = await this.prisma.raw.public_signup_payment_sessions.create({
      data: {
        selected_plan_id: input.selectedPlanId,
        plan_name: String(input.planName || '').trim().slice(0, 255) || 'Plano',
        monthly_amount: monthlyAmount,
        currency,
        trial_days: trialDays,
        signup_payload_json: input.signupPayload as any,
        custom_module_ids_json: (input.customModuleIds || []) as any,
        admin_email: adminEmail,
        admin_full_name: String(input.adminFullName || '').trim() || null,
        company_name: String(input.companyName || '').trim() || null,
        stripe_customer_id: customer.id,
        stripe_setup_intent_id: setupIntent.id,
        stripe_setup_client_secret: setupIntent.client_secret,
        setup_status: String(setupIntent.status || 'requires_confirmation'),
        expires_at: expiresAt,
      } as any,
    });

    return {
      session_id: saved.id,
      stripe_publishable_key: this.getPublishableKeyOrThrow(),
      setup_intent_client_secret: setupIntent.client_secret,
      requires_payment: true,
      trial_days: trialDays,
      plan_name: saved.plan_name,
      monthly_amount: Number(saved.monthly_amount || 0),
      currency: saved.currency,
      expires_at: saved.expires_at,
    };
  }

  async getPublicSignupPaymentSession(sessionId: string) {
    const id = String(sessionId || '').trim();
    if (!id) throw new BadRequestException('session_id e obrigatorio.');

    const row = await this.prisma.raw.public_signup_payment_sessions.findUnique({
      where: { id },
    });

    if (!row) {
      throw new NotFoundException('Sessao de pagamento nao encontrada.');
    }
    return row;
  }

  async validateSetupIntentForSession(
    sessionRow: any,
    options?: { paymentMethodId?: string; setupIntentId?: string },
  ) {
    const stripe = this.getStripeOrThrow();
    const setupIntentId = String(sessionRow?.stripe_setup_intent_id || '').trim();
    if (!setupIntentId) throw new BadRequestException('Sessao de pagamento sem setup_intent.');

    if (options?.setupIntentId && String(options.setupIntentId).trim() !== setupIntentId) {
      throw new BadRequestException('setup_intent_id invalido para esta sessao.');
    }

    const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
    const setupStatus = String(setupIntent.status || '').toLowerCase();
    const customerId = String(setupIntent.customer || '');

    if (!customerId || customerId !== String(sessionRow?.stripe_customer_id || '')) {
      throw new BadRequestException('Setup intent nao pertence ao cliente da sessao.');
    }

    if (setupStatus !== 'succeeded') {
      throw new BadRequestException(
        'Cartao ainda nao validado. Confirme os dados do cartao antes de concluir.',
      );
    }

    const paymentMethodId = String(setupIntent.payment_method || '').trim();
    if (!paymentMethodId) {
      throw new BadRequestException('Nenhum metodo de pagamento confirmado para esta sessao.');
    }

    if (options?.paymentMethodId && String(options.paymentMethodId).trim() !== paymentMethodId) {
      throw new BadRequestException('payment_method_id nao confere com o setup intent confirmado.');
    }

    await this.prisma.raw.public_signup_payment_sessions.update({
      where: { id: String(sessionRow.id) },
      data: {
        setup_status: String(setupIntent.status || 'succeeded'),
        payment_method_id: paymentMethodId,
        updated_at: new Date(),
      },
    });

    return { setupIntent, paymentMethodId };
  }

  async createSignupStripeSubscription(
    input: SignupStripeSubscriptionInput,
  ): Promise<{ subscription: Stripe.Subscription; stripePlanPriceId: string | null }> {
    const stripe = this.getStripeOrThrow();
    const currency = this.resolveCurrency(input.currency);
    const priceBinding = await this.resolveStripePriceForPlan({
      planId: input.planId,
      planName: input.planName,
      monthlyAmount: input.monthlyAmount,
      currency,
    });

    const subscription = await stripe.subscriptions.create({
      customer: input.customerId,
      default_payment_method: input.paymentMethodId,
      trial_period_days: Math.max(1, Math.min(30, Math.trunc(Number(input.trialDays || 7)))),
      items: [{ price: priceBinding.priceId }],
      payment_settings: {
        save_default_payment_method: 'on_subscription',
      },
      metadata: {
        source: 'gecom_public_signup',
        plan_name: String(input.planName || '').slice(0, 120),
        ...(input.planId ? { plan_id: input.planId } : {}),
        ...(input.metadata || {}),
      },
    });

    return {
      subscription,
      stripePlanPriceId: priceBinding.bindingId,
    };
  }

  async cancelStripeSubscriptionSafe(subscriptionId: string): Promise<void> {
    const stripe = this.getStripeOrThrow();
    const id = String(subscriptionId || '').trim();
    if (!id) return;

    try {
      await stripe.subscriptions.cancel(id);
    } catch (_error) {
      // best-effort rollback, do not hide original business error
    }
  }

  async attachStripeDataToTenant(input: AttachTenantStripeInput): Promise<void> {
    const now = new Date();

    await this.prisma.raw.billing_stripe_customers.upsert({
      where: {
        tenant_id: input.tenantId,
      },
      update: {
        stripe_customer_id: input.stripeCustomerId,
        email: input.adminEmail || null,
        company_name: input.companyName || null,
        is_active: true,
        updated_at: now,
      },
      create: {
        tenant_id: input.tenantId,
        stripe_customer_id: input.stripeCustomerId,
        email: input.adminEmail || null,
        company_name: input.companyName || null,
        is_active: true,
      },
    } as any);

    const mappedStatus = this.mapStripeStatusToTenantStatus(input.stripeSubscription.status);
    const trialEndAt = this.fromUnixTimestamp(input.stripeSubscription.trial_end);
    const currentPeriodEndAt = this.fromUnixTimestamp(input.stripeSubscription.current_period_end);
    const endsAt =
      mappedStatus === TenantSubscriptionStatus.CANCELED
        ? new Date()
        : trialEndAt || currentPeriodEndAt || null;

    if (input.tenantSubscriptionId) {
      await this.prisma.raw.tenant_subscriptions.update({
        where: { id: input.tenantSubscriptionId },
        data: {
          ...(input.planId ? { plan_id: input.planId } : {}),
          status: mappedStatus,
          renews_at: trialEndAt || null,
          ends_at: mappedStatus === TenantSubscriptionStatus.CANCELED ? endsAt : null,
          updated_at: now,
        },
      });
    }

    const existing = await this.prisma.raw.billing_stripe_subscriptions.findUnique({
      where: { stripe_subscription_id: input.stripeSubscription.id },
      select: { id: true },
    });

    if (existing?.id) {
      await this.prisma.raw.billing_stripe_subscriptions.update({
        where: { id: existing.id },
        data: this.mapStripeSubscriptionToPersistence(input, now),
      });
      return;
    }

    await this.prisma.raw.billing_stripe_subscriptions.create({
      data: this.mapStripeSubscriptionToPersistence(input, now),
    });
  }

  async markPublicSignupPaymentSessionCompleted(sessionId: string, patch?: Record<string, any>) {
    await this.prisma.raw.public_signup_payment_sessions.update({
      where: { id: String(sessionId || '').trim() },
      data: {
        completed_at: new Date(),
        ...(patch || {}),
        updated_at: new Date(),
      },
    });
  }

  async getMyPlanSummary(tenantId: string) {
    const current = await this.prisma.raw.tenant_subscriptions.findFirst({
      where: {
        tenant_id: tenantId,
        status: { in: [TenantSubscriptionStatus.TRIAL, TenantSubscriptionStatus.ACTIVE] },
      },
      include: {
        plan: true,
      },
      orderBy: [{ starts_at: 'desc' }, { created_at: 'desc' }],
    });

    let latest = current
      ? current
      : await this.prisma.raw.tenant_subscriptions.findFirst({
          where: { tenant_id: tenantId },
          include: { plan: true },
          orderBy: [{ updated_at: 'desc' }, { created_at: 'desc' }],
        });

    const stripeRow = await this.prisma.raw.billing_stripe_subscriptions.findFirst({
      where: { tenant_id: tenantId },
      orderBy: [{ updated_at: 'desc' }, { created_at: 'desc' }],
    });

    let stripeSnapshot: any = null;
    if (stripeRow?.stripe_subscription_id && this.isStripeConfigured()) {
      const stripe = this.getStripeOrThrow();
      try {
        const stripeSub = await stripe.subscriptions.retrieve(stripeRow.stripe_subscription_id);
        const mappedStatus = this.mapStripeStatusToTenantStatus(stripeSub.status);
        const syncedRenewsAt = this.fromUnixTimestamp(stripeSub.trial_end);
        const syncedEndsAt =
          mappedStatus === TenantSubscriptionStatus.CANCELED
            ? this.fromUnixTimestamp(stripeSub.current_period_end) || new Date()
            : null;

        if (latest?.id && latest.status !== mappedStatus) {
          latest = await this.prisma.raw.tenant_subscriptions.update({
            where: { id: latest.id },
            data: {
              status: mappedStatus,
              renews_at: syncedRenewsAt,
              ends_at: syncedEndsAt,
              updated_at: new Date(),
            },
            include: { plan: true },
          });
        }

        stripeSnapshot = {
          id: stripeSub.id,
          status: stripeSub.status,
          cancel_at_period_end: !!stripeSub.cancel_at_period_end,
          trial_end_at: this.fromUnixTimestamp(stripeSub.trial_end),
          current_period_end_at: this.fromUnixTimestamp(stripeSub.current_period_end),
        };
      } catch (_error) {
        // keep local data when stripe is temporarily unavailable
      }
    }

    const plans = await this.prisma.raw.plans.findMany({
      where: {
        is_active: true,
        is_public: true,
        is_custom: false,
      },
      orderBy: [{ monthly_price: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        monthly_price: true,
      },
    });

    const trialEndsAt = latest?.status === TenantSubscriptionStatus.TRIAL ? latest?.renews_at || null : null;
    const trialDaysLeft =
      trialEndsAt && latest?.status === TenantSubscriptionStatus.TRIAL
        ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86400000))
        : 0;

    return {
      current: latest
        ? {
            tenant_subscription_id: latest.id,
            plan_id: latest.plan_id,
            plan_name: latest.plan?.name || null,
            monthly_price: Number(latest.plan?.monthly_price || 0),
            status: latest.status,
            starts_at: latest.starts_at,
            ends_at: latest.ends_at,
            renews_at: latest.renews_at,
            trial_days_left: trialDaysLeft,
          }
        : null,
      stripe: stripeRow
        ? {
            stripe_subscription_id: stripeRow.stripe_subscription_id,
            status: stripeSnapshot?.status || stripeRow.status,
            cancel_at_period_end: stripeSnapshot?.cancel_at_period_end ?? stripeRow.cancel_at_period_end,
            trial_end_at: stripeSnapshot?.trial_end_at || stripeRow.trial_end_at,
            current_period_end_at: stripeSnapshot?.current_period_end_at || stripeRow.current_period_end_at,
          }
        : null,
      trial_days_default: this.getTrialDays(),
      plans: plans.map((plan) => ({
        id: plan.id,
        code: plan.code,
        name: plan.name,
        description: plan.description,
        monthly_price: Number(plan.monthly_price || 0),
      })),
    };
  }

  async upgradeMyPlan(tenantId: string, planId: string) {
    const stripe = this.getStripeOrThrow();
    const cleanPlanId = String(planId || '').trim();
    if (!cleanPlanId) throw new BadRequestException('plan_id e obrigatorio.');

    const targetPlan = await this.prisma.raw.plans.findFirst({
      where: { id: cleanPlanId, is_active: true, is_public: true, is_custom: false },
    });
    if (!targetPlan) throw new NotFoundException('Plano selecionado nao encontrado.');

    const localSubscription = await this.prisma.raw.tenant_subscriptions.findFirst({
      where: {
        tenant_id: tenantId,
        status: { in: [TenantSubscriptionStatus.TRIAL, TenantSubscriptionStatus.ACTIVE] },
      },
      orderBy: [{ starts_at: 'desc' }, { created_at: 'desc' }],
    });
    if (!localSubscription) {
      throw new BadRequestException('Assinatura atual nao encontrada para este tenant.');
    }

    const stripeRow = await this.prisma.raw.billing_stripe_subscriptions.findFirst({
      where: {
        tenant_id: tenantId,
        tenant_subscription_id: localSubscription.id,
      },
      orderBy: [{ updated_at: 'desc' }, { created_at: 'desc' }],
    });
    if (!stripeRow?.stripe_subscription_id) {
      throw new BadRequestException('Assinatura Stripe nao encontrada para este tenant.');
    }

    const stripeSub = await stripe.subscriptions.retrieve(stripeRow.stripe_subscription_id);
    const itemId = stripeSub.items?.data?.[0]?.id;
    if (!itemId) {
      throw new BadRequestException('Item da assinatura Stripe nao encontrado.');
    }

    const priceBinding = await this.resolveStripePriceForPlan({
      planId: targetPlan.id,
      planName: targetPlan.name,
      monthlyAmount: Number(targetPlan.monthly_price || 0),
      currency: this.resolveCurrency(),
    });

    const updatedStripeSub = await stripe.subscriptions.update(stripeSub.id, {
      cancel_at_period_end: false,
      proration_behavior: 'none',
      items: [{ id: itemId, price: priceBinding.priceId }],
      metadata: {
        ...(stripeSub.metadata || {}),
        gecom_plan_id: targetPlan.id,
        gecom_plan_name: String(targetPlan.name || '').slice(0, 120),
      },
    });

    await this.prisma.raw.tenant_subscriptions.update({
      where: { id: localSubscription.id },
      data: {
        plan_id: targetPlan.id,
        status: this.mapStripeStatusToTenantStatus(updatedStripeSub.status),
        renews_at: this.fromUnixTimestamp(updatedStripeSub.trial_end),
        updated_at: new Date(),
      },
    });

    await this.prisma.raw.billing_stripe_subscriptions.updateMany({
      where: { stripe_subscription_id: updatedStripeSub.id, tenant_id: tenantId },
      data: {
        plan_id: targetPlan.id,
        stripe_plan_price_id: priceBinding.bindingId || null,
        stripe_price_id: priceBinding.priceId,
        status: String(updatedStripeSub.status || stripeRow.status || 'active'),
        cancel_at_period_end: !!updatedStripeSub.cancel_at_period_end,
        trial_start_at: this.fromUnixTimestamp(updatedStripeSub.trial_start),
        trial_end_at: this.fromUnixTimestamp(updatedStripeSub.trial_end),
        current_period_start_at: this.fromUnixTimestamp(updatedStripeSub.current_period_start),
        current_period_end_at: this.fromUnixTimestamp(updatedStripeSub.current_period_end),
        canceled_at: this.fromUnixTimestamp((updatedStripeSub as any)?.canceled_at),
        updated_at: new Date(),
      },
    });

    return this.getMyPlanSummary(tenantId);
  }

  async cancelMyPlan(tenantId: string, immediate?: boolean) {
    const stripe = this.getStripeOrThrow();
    const localSubscription = await this.prisma.raw.tenant_subscriptions.findFirst({
      where: {
        tenant_id: tenantId,
        status: { in: [TenantSubscriptionStatus.TRIAL, TenantSubscriptionStatus.ACTIVE] },
      },
      orderBy: [{ starts_at: 'desc' }, { created_at: 'desc' }],
    });
    if (!localSubscription) {
      throw new BadRequestException('Assinatura ativa nao encontrada.');
    }

    const stripeRow = await this.prisma.raw.billing_stripe_subscriptions.findFirst({
      where: { tenant_id: tenantId, tenant_subscription_id: localSubscription.id },
      orderBy: [{ updated_at: 'desc' }, { created_at: 'desc' }],
    });
    if (!stripeRow?.stripe_subscription_id) {
      throw new BadRequestException('Assinatura Stripe nao encontrada.');
    }

    const shouldImmediate = Boolean(immediate) || localSubscription.status === TenantSubscriptionStatus.TRIAL;
    const now = new Date();
    let stripeSubscription: Stripe.Subscription;

    if (shouldImmediate) {
      stripeSubscription = await stripe.subscriptions.cancel(stripeRow.stripe_subscription_id);
      await this.prisma.raw.tenant_subscriptions.update({
        where: { id: localSubscription.id },
        data: {
          status: TenantSubscriptionStatus.CANCELED,
          ends_at: now,
          renews_at: null,
          updated_at: now,
        },
      });
    } else {
      stripeSubscription = await stripe.subscriptions.update(stripeRow.stripe_subscription_id, {
        cancel_at_period_end: true,
      });
    }

    await this.prisma.raw.billing_stripe_subscriptions.updateMany({
      where: { stripe_subscription_id: stripeSubscription.id, tenant_id: tenantId },
      data: {
        status: String(stripeSubscription.status || stripeRow.status || 'active'),
        cancel_at_period_end: !!stripeSubscription.cancel_at_period_end,
        trial_start_at: this.fromUnixTimestamp(stripeSubscription.trial_start),
        trial_end_at: this.fromUnixTimestamp(stripeSubscription.trial_end),
        current_period_start_at: this.fromUnixTimestamp(stripeSubscription.current_period_start),
        current_period_end_at: this.fromUnixTimestamp(stripeSubscription.current_period_end),
        canceled_at: this.fromUnixTimestamp((stripeSubscription as any)?.canceled_at),
        updated_at: now,
      },
    });

    return this.getMyPlanSummary(tenantId);
  }

  async createCustomRequest(input: {
    tenantId: string;
    userId: string;
    userEmail?: string | null;
    subject?: string | null;
    message: string;
  }) {
    const tenantId = String(input.tenantId || '').trim();
    const userId = String(input.userId || '').trim();
    const subject = String(input.subject || '').trim() || 'Solicitacao de desenvolvimento personalizado';
    const message = String(input.message || '').trim();

    if (!tenantId || !userId) {
      throw new BadRequestException('tenant_id e user_id sao obrigatorios.');
    }
    if (!message || message.length < 10) {
      throw new BadRequestException('Informe uma mensagem com mais detalhes.');
    }

    const [tenant, user] = await Promise.all([
      this.prisma.raw.tenants.findUnique({ where: { id: tenantId }, include: { company: true } }),
      this.prisma.raw.users.findUnique({ where: { id: userId } }),
    ]);

    if (!tenant) throw new NotFoundException('Tenant nao encontrado.');
    if (!user) throw new NotFoundException('Usuario nao encontrado.');

    const created = await this.prisma.raw.billing_custom_requests.create({
      data: {
        tenant_id: tenantId,
        user_id: userId,
        subject,
        message,
        status: 'NEW',
      },
    });

    const notifyTo = String(process.env.BILLING_CUSTOM_REQUEST_EMAIL || 'ggherardi97@gmail.com').trim();
    await this.mailer.sendAutomationEmail({
      to: notifyTo,
      subject: `[GECOM] ${subject}`,
      text: [
        `Tenant: ${tenant.name} (${tenant.id})`,
        `Empresa: ${tenant.company?.company_name || 'N/D'}`,
        `Usuario: ${user.full_name} (${input.userEmail || user.email})`,
        '',
        'Mensagem:',
        message,
      ].join('\n'),
    });

    return { ok: true, id: created.id };
  }

  private getStripeOrThrow(): Stripe {
    const secret = String(process.env.STRIPE_SECRET_KEY || '').trim();
    if (!secret) {
      throw new BadRequestException(
        'Stripe nao configurado: defina STRIPE_SECRET_KEY no ambiente do backend.',
      );
    }

    if (!this.stripeClient || this.stripeSecretCache !== secret) {
      this.stripeClient = new Stripe(secret);
      this.stripeSecretCache = secret;
    }

    return this.stripeClient;
  }

  private resolveCurrency(raw?: string): string {
    const value = String(raw || process.env.STRIPE_CURRENCY || 'BRL')
      .trim()
      .toLowerCase();
    return value || 'brl';
  }

  private normalizeCoupon(raw?: string): string {
    return String(raw || '')
      .trim()
      .toUpperCase();
  }

  private normalizeMoney(value: number): number {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Valor mensal invalido para assinatura Stripe.');
    }
    return Number(amount.toFixed(4));
  }

  private moneyToStripeUnitAmount(value: number): number {
    return Math.max(1, Math.round(this.normalizeMoney(value) * 100));
  }

  private fromUnixTimestamp(value: number | null | undefined): Date | null {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    return new Date(n * 1000);
  }

  private mapStripeStatusToTenantStatus(status: Stripe.Subscription.Status): TenantSubscriptionStatus {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'trialing') return TenantSubscriptionStatus.TRIAL;
    if (normalized === 'active') return TenantSubscriptionStatus.ACTIVE;
    if (normalized === 'canceled' || normalized === 'incomplete_expired') {
      return TenantSubscriptionStatus.CANCELED;
    }
    return TenantSubscriptionStatus.SUSPENDED;
  }

  private async resolveStripePriceForPlan(params: {
    planId: string | null;
    planName: string;
    monthlyAmount: number;
    currency: string;
  }): Promise<{ priceId: string; bindingId: string | null }> {
    const stripe = this.getStripeOrThrow();
    const currency = this.resolveCurrency(params.currency);

    if (params.planId) {
      const existing = await this.prisma.raw.billing_stripe_plan_prices.findFirst({
        where: {
          plan_id: params.planId,
          currency: currency.toUpperCase(),
          is_active: true,
        },
      });

      if (existing?.stripe_price_id) {
        return { priceId: existing.stripe_price_id, bindingId: existing.id };
      }

      const createdProduct = await stripe.products.create({
        name: `${params.planName} (GECOM)`.slice(0, 120),
        metadata: {
          source: 'gecom_plan_catalog',
          plan_id: params.planId,
        },
      });
      const createdPrice = await stripe.prices.create({
        currency,
        unit_amount: this.moneyToStripeUnitAmount(params.monthlyAmount),
        recurring: { interval: 'month' },
        product: createdProduct.id,
      });

      const saved = await this.prisma.raw.billing_stripe_plan_prices.create({
        data: {
          plan_id: params.planId,
          currency: currency.toUpperCase(),
          stripe_product_id: createdProduct.id,
          stripe_price_id: createdPrice.id,
          unit_amount: this.normalizeMoney(params.monthlyAmount),
          is_active: true,
        },
      });

      return { priceId: createdPrice.id, bindingId: saved.id };
    }

    const product = await stripe.products.create({
      name: `${params.planName} (GECOM)`.slice(0, 120),
      metadata: {
        source: 'gecom_custom_signup',
      },
    });
    const price = await stripe.prices.create({
      currency,
      unit_amount: this.moneyToStripeUnitAmount(params.monthlyAmount),
      recurring: { interval: 'month' },
      product: product.id,
    });

    return { priceId: price.id, bindingId: null };
  }

  private mapStripeSubscriptionToPersistence(input: AttachTenantStripeInput, now: Date) {
    return {
      tenant_id: input.tenantId,
      tenant_subscription_id: input.tenantSubscriptionId || null,
      plan_id: input.planId || null,
      stripe_plan_price_id: input.stripePlanPriceId || null,
      stripe_customer_id: input.stripeCustomerId,
      stripe_subscription_id: input.stripeSubscription.id,
      stripe_price_id: input.stripeSubscription.items?.data?.[0]?.price?.id || null,
      status: String(input.stripeSubscription.status || 'active'),
      cancel_at_period_end: !!input.stripeSubscription.cancel_at_period_end,
      trial_start_at: this.fromUnixTimestamp(input.stripeSubscription.trial_start),
      trial_end_at: this.fromUnixTimestamp(input.stripeSubscription.trial_end),
      current_period_start_at: this.fromUnixTimestamp(input.stripeSubscription.current_period_start),
      current_period_end_at: this.fromUnixTimestamp(input.stripeSubscription.current_period_end),
      canceled_at: this.fromUnixTimestamp((input.stripeSubscription as any)?.canceled_at),
      metadata_json: (input.stripeSubscription.metadata || {}) as any,
      updated_at: now,
    };
  }
}
