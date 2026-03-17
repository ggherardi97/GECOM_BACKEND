import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantSubscriptionStatus } from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { getPortalEmailFrom } from '../../common/branding/portal-brand.util';

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

type StripeWebhookInput = {
  payload: any;
  signature?: string;
  rawBody?: Buffer | string;
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

  async handleStripeWebhook(input: StripeWebhookInput) {
    const event = this.parseStripeWebhookEvent(input);
    await this.processStripeEvent(event);
    return { received: true, event_id: event.id, event_type: event.type };
  }

  async sendConvertTrialStartedEmail(input: {
    to: string;
    name?: string | null;
    trialDays: number;
    trialEndAt?: Date | null;
    monthlyAmount: number;
    currency?: string | null;
  }) {
    const to = String(input.to || '').trim().toLowerCase();
    if (!to) return;

    const name = String(input.name || '').trim() || 'cliente';
    const trialDays = Math.max(1, Math.min(30, Math.trunc(Number(input.trialDays || 7))));
    const trialEndAt = input.trialEndAt ? new Date(input.trialEndAt) : null;
    const chargeDateLabel = trialEndAt
      ? this.formatDatePtBr(trialEndAt)
      : `em ${trialDays} dias`;
    const formattedMonthly = this.formatMoney(
      Number(input.monthlyAmount || 0),
      String(input.currency || this.resolveCurrency() || 'BRL'),
    );

    const subject = 'Bem-vindo a Convert Plus - seu periodo de teste comecou';
    const html = `
      <div style="font-family: Arial, Helvetica, sans-serif; color: #0f2b42; line-height: 1.6;">
        <h2 style="margin:0 0 12px;">Bem-vindo, ${this.escapeHtml(name)}!</h2>
        <p style="margin:0 0 10px;">
          Seu cadastro na <strong>Convert Plus</strong> foi concluido e seu periodo de teste ja comecou.
        </p>
        <p style="margin:0 0 10px;">
          O teste gratuito e de <strong>${trialDays} dias</strong>.
        </p>
        <p style="margin:0 0 10px;">
          Apos esse periodo, sua assinatura sera cobrada no cartao cadastrado no valor de
          <strong>${this.escapeHtml(formattedMonthly)}/mes</strong>, com a primeira cobranca prevista para
          <strong>${this.escapeHtml(chargeDateLabel)}</strong>.
        </p>
        <p style="margin:0 0 10px;">
          Nao se preocupe: cancele a qualquer momento em <strong>Perfil -&gt; Meu plano</strong>.
        </p>
      </div>
    `;
    const text = [
      `Bem-vindo, ${name}!`,
      'Seu cadastro na Convert Plus foi concluido e seu periodo de teste ja comecou.',
      `Periodo de teste: ${trialDays} dias.`,
      `Primeira cobranca prevista: ${chargeDateLabel}.`,
      `Valor mensal apos o trial: ${formattedMonthly}/mes.`,
      'Nao se preocupe: cancele a qualquer momento em Perfil -> Meu plano.',
    ].join('\n');

    await this.mailer.sendAutomationEmail({
      to,
      from: getPortalEmailFrom('convert'),
      subject,
      html,
      text,
    });
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
    const renewsReference =
      mappedStatus === TenantSubscriptionStatus.TRIAL
        ? trialEndAt || currentPeriodEndAt || null
        : mappedStatus === TenantSubscriptionStatus.ACTIVE
          ? currentPeriodEndAt || trialEndAt || null
          : null;
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
          renews_at: renewsReference,
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

    let stripeRow = await this.prisma.raw.billing_stripe_subscriptions.findFirst({
      where: { tenant_id: tenantId },
      orderBy: [{ updated_at: 'desc' }, { created_at: 'desc' }],
    });

    let stripeSnapshot: any = null;
    if (stripeRow?.stripe_subscription_id && this.isStripeConfigured()) {
      const stripe = this.getStripeOrThrow();
      try {
        const stripeSub = await stripe.subscriptions.retrieve(stripeRow.stripe_subscription_id);
        await this.syncLocalStripeSubscription(stripeSub);

        latest = await this.prisma.raw.tenant_subscriptions.findFirst({
          where: {
            tenant_id: tenantId,
            status: { in: [TenantSubscriptionStatus.TRIAL, TenantSubscriptionStatus.ACTIVE] },
          },
          include: { plan: true },
          orderBy: [{ starts_at: 'desc' }, { created_at: 'desc' }],
        });
        if (!latest) {
          latest = await this.prisma.raw.tenant_subscriptions.findFirst({
            where: { tenant_id: tenantId },
            include: { plan: true },
            orderBy: [{ updated_at: 'desc' }, { created_at: 'desc' }],
          });
        }

        stripeRow = await this.prisma.raw.billing_stripe_subscriptions.findFirst({
          where: { tenant_id: tenantId },
          orderBy: [{ updated_at: 'desc' }, { created_at: 'desc' }],
        });

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
        renews_at: this.resolveRenewsAtFromStripeSubscription(
          updatedStripeSub,
          this.mapStripeStatusToTenantStatus(updatedStripeSub.status),
        ),
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

  private parseStripeWebhookEvent(input: StripeWebhookInput): Stripe.Event {
    const payload = input?.payload;
    const signature = String(input?.signature || '').trim();
    const webhookSecret = String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
    const stripe = this.getStripeOrThrow();

    if (webhookSecret) {
      if (!signature) {
        throw new BadRequestException('Cabecalho stripe-signature ausente.');
      }
      const rawPayload = Buffer.isBuffer(input?.rawBody)
        ? input.rawBody
        : typeof input?.rawBody === 'string'
          ? Buffer.from(input.rawBody)
          : Buffer.from(JSON.stringify(payload || {}));

      try {
        return stripe.webhooks.constructEvent(rawPayload, signature, webhookSecret);
      } catch {
        throw new BadRequestException('Assinatura do webhook Stripe invalida.');
      }
    }

    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException('Payload de webhook Stripe invalido.');
    }

    const event = payload as Stripe.Event;
    if (!event.type) {
      throw new BadRequestException('Evento Stripe sem tipo.');
    }
    return event;
  }

  private async processStripeEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'invoice.payment_succeeded':
        await this.handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        return;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await this.syncLocalStripeSubscription(event.data.object as Stripe.Subscription);
        return;
      default:
        return;
    }
  }

  private async handleInvoicePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
    const subscriptionIdRaw = invoice.subscription;
    const subscriptionId =
      typeof subscriptionIdRaw === 'string'
        ? subscriptionIdRaw
        : String((subscriptionIdRaw as any)?.id || '').trim();
    if (!subscriptionId) return;

    const amountPaid = Number(invoice.amount_paid || 0) / 100;
    if (!Number.isFinite(amountPaid) || amountPaid <= 0) return;

    const stripe = this.getStripeOrThrow();
    const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
    const syncResult = await this.syncLocalStripeSubscription(stripeSubscription);
    if (!syncResult.tenantId) return;

    const isConvert = await this.isConvertTenantSubscription(
      syncResult.tenantId,
      stripeSubscription,
      syncResult.stripeRow,
    );
    if (!isConvert) return;

    await this.sendConvertChargeSucceededEmail({
      tenantId: syncResult.tenantId,
      stripeSubscription,
      stripeRow: syncResult.stripeRow,
      invoice,
      amountPaid,
    });
  }

  private async syncLocalStripeSubscription(
    stripeSubscription: Stripe.Subscription,
  ): Promise<{ tenantId: string | null; stripeRow: any | null; tenantSubscriptionId: string | null }> {
    const subscriptionId = String(stripeSubscription?.id || '').trim();
    if (!subscriptionId) return { tenantId: null, stripeRow: null, tenantSubscriptionId: null };

    const stripeRow = await this.prisma.raw.billing_stripe_subscriptions.findUnique({
      where: { stripe_subscription_id: subscriptionId },
    });
    if (!stripeRow?.tenant_id) {
      return { tenantId: null, stripeRow: stripeRow || null, tenantSubscriptionId: null };
    }

    const tenantId = String(stripeRow.tenant_id);
    const now = new Date();
    const mappedStatus = this.mapStripeStatusToTenantStatus(stripeSubscription.status);
    const trialStartAt = this.fromUnixTimestamp(stripeSubscription.trial_start);
    const trialEndAt = this.fromUnixTimestamp(stripeSubscription.trial_end);
    const currentPeriodStartAt = this.fromUnixTimestamp(stripeSubscription.current_period_start);
    const currentPeriodEndAt = this.fromUnixTimestamp(stripeSubscription.current_period_end);
    const canceledAt = this.fromUnixTimestamp((stripeSubscription as any)?.canceled_at);

    let tenantSubscriptionId = String(stripeRow.tenant_subscription_id || '').trim() || null;
    if (!tenantSubscriptionId) {
      const activeLocal = await this.prisma.raw.tenant_subscriptions.findFirst({
        where: {
          tenant_id: tenantId,
          status: { in: [TenantSubscriptionStatus.TRIAL, TenantSubscriptionStatus.ACTIVE] },
        },
        orderBy: [{ starts_at: 'desc' }, { created_at: 'desc' }],
      });
      if (activeLocal?.id) {
        tenantSubscriptionId = String(activeLocal.id);
      }
    }

    await this.prisma.raw.billing_stripe_subscriptions.updateMany({
      where: { tenant_id: tenantId, stripe_subscription_id: subscriptionId },
      data: {
        tenant_subscription_id: tenantSubscriptionId,
        stripe_customer_id: String(stripeSubscription.customer || stripeRow.stripe_customer_id || ''),
        stripe_price_id: stripeSubscription.items?.data?.[0]?.price?.id || stripeRow.stripe_price_id || null,
        status: String(stripeSubscription.status || stripeRow.status || 'active'),
        cancel_at_period_end: !!stripeSubscription.cancel_at_period_end,
        trial_start_at: trialStartAt,
        trial_end_at: trialEndAt,
        current_period_start_at: currentPeriodStartAt,
        current_period_end_at: currentPeriodEndAt,
        canceled_at: canceledAt,
        metadata_json: (stripeSubscription.metadata || {}) as any,
        updated_at: now,
      },
    });

    const renewsAt = this.resolveRenewsAtFromStripeSubscription(stripeSubscription, mappedStatus);
    const endsAt =
      mappedStatus === TenantSubscriptionStatus.CANCELED
        ? canceledAt || currentPeriodEndAt || now
        : null;

    if (tenantSubscriptionId) {
      await this.prisma.raw.tenant_subscriptions.update({
        where: { id: tenantSubscriptionId },
        data: {
          ...(stripeRow.plan_id ? { plan_id: stripeRow.plan_id } : {}),
          status: mappedStatus,
          renews_at: renewsAt,
          ends_at: mappedStatus === TenantSubscriptionStatus.CANCELED ? endsAt : null,
          updated_at: now,
        },
      });
    }

    const refreshedRow = await this.prisma.raw.billing_stripe_subscriptions.findUnique({
      where: { stripe_subscription_id: subscriptionId },
    });

    return {
      tenantId,
      stripeRow: refreshedRow || stripeRow,
      tenantSubscriptionId,
    };
  }

  private resolveRenewsAtFromStripeSubscription(
    stripeSubscription: Stripe.Subscription,
    mappedStatus: TenantSubscriptionStatus,
  ): Date | null {
    if (mappedStatus === TenantSubscriptionStatus.TRIAL) {
      return this.fromUnixTimestamp(stripeSubscription.trial_end) ||
        this.fromUnixTimestamp(stripeSubscription.current_period_end);
    }
    if (mappedStatus === TenantSubscriptionStatus.ACTIVE) {
      return this.fromUnixTimestamp(stripeSubscription.current_period_end) ||
        this.fromUnixTimestamp(stripeSubscription.trial_end);
    }
    return null;
  }

  private async isConvertTenantSubscription(
    tenantId: string,
    stripeSubscription: Stripe.Subscription,
    stripeRow?: any,
  ): Promise<boolean> {
    const metadata = stripeSubscription.metadata || {};
    const localMetadata = (stripeRow?.metadata_json || {}) as Record<string, unknown>;
    const metadataBrand = String(
      metadata.portal_brand || localMetadata.portal_brand || '',
    )
      .trim()
      .toLowerCase();

    if (metadataBrand === 'convert' || metadataBrand === 'convert-plus') return true;
    if (metadataBrand === 'gecom') return false;

    const tenant = await this.prisma.raw.tenants.findUnique({
      where: { id: tenantId },
      select: { slug: true },
    });

    return String(tenant?.slug || '')
      .trim()
      .toLowerCase()
      .includes('convert');
  }

  private async sendConvertChargeSucceededEmail(input: {
    tenantId: string;
    stripeSubscription: Stripe.Subscription;
    stripeRow?: any;
    invoice: Stripe.Invoice;
    amountPaid: number;
  }): Promise<void> {
    const tenantId = String(input.tenantId || '').trim();
    if (!tenantId) return;

    const [tenant, stripeCustomer] = await Promise.all([
      this.prisma.raw.tenants.findUnique({
        where: { id: tenantId },
        include: {
          company: {
            include: {
              primaryUser: {
                select: { email: true, full_name: true },
              },
            },
          },
        },
      }),
      this.prisma.raw.billing_stripe_customers.findFirst({
        where: { tenant_id: tenantId },
        select: { email: true },
      }),
    ]);

    const to = String(tenant?.company?.primaryUser?.email || stripeCustomer?.email || '')
      .trim()
      .toLowerCase();
    if (!to) return;

    const planId = String(input.stripeRow?.plan_id || '').trim() || null;
    const plan = planId
      ? await this.prisma.raw.plans.findUnique({
          where: { id: planId },
          select: { name: true, monthly_price: true },
        })
      : null;

    const currency = String(input.invoice.currency || this.resolveCurrency() || 'BRL').toUpperCase();
    const chargeValue = this.formatMoney(input.amountPaid, currency);
    const planValue = this.formatMoney(Number(plan?.monthly_price || input.amountPaid || 0), currency);
    const planName = String(
      plan?.name ||
        input.stripeSubscription.metadata?.gecom_plan_name ||
        input.stripeRow?.metadata_json?.gecom_plan_name ||
        'Plano atual',
    ).trim();

    const paidAt =
      this.fromUnixTimestamp((input.invoice as any)?.status_transitions?.paid_at) ||
      this.fromUnixTimestamp(input.invoice.created) ||
      new Date();
    const periodEnd =
      this.fromUnixTimestamp(input.stripeSubscription.current_period_end) ||
      this.fromUnixTimestamp((input.invoice as any)?.period_end) ||
      null;

    const paidAtLabel = this.formatDatePtBr(paidAt);
    const periodEndLabel = periodEnd ? this.formatDatePtBr(periodEnd) : null;
    const contactName = String(tenant?.company?.primaryUser?.full_name || 'cliente').trim();
    const tenantName = String(tenant?.name || 'sua empresa').trim();

    const subject = `Cobranca confirmada - ${planName} - Convert Plus`;
    const html = `
      <div style="font-family: Arial, Helvetica, sans-serif; color: #0f2b42; line-height: 1.6;">
        <h2 style="margin:0 0 12px;">Ola, ${this.escapeHtml(contactName)}.</h2>
        <p style="margin:0 0 10px;">
          Confirmamos a cobranca mensal do plano da empresa <strong>${this.escapeHtml(tenantName)}</strong>.
        </p>
        <p style="margin:0 0 10px;">
          <strong>Valor cobrado:</strong> ${this.escapeHtml(chargeValue)}<br/>
          <strong>Valor do plano (${this.escapeHtml(planName)}):</strong> ${this.escapeHtml(planValue)} / mes<br/>
          <strong>Data da cobranca:</strong> ${this.escapeHtml(paidAtLabel)}
          ${periodEndLabel ? `<br/><strong>Proxima referencia de ciclo:</strong> ${this.escapeHtml(periodEndLabel)}` : ''}
        </p>
        <p style="margin:0;">
          Voce pode acompanhar ou cancelar o plano em <strong>Perfil -&gt; Meu plano</strong>.
        </p>
      </div>
    `;
    const text = [
      `Ola, ${contactName}.`,
      `Confirmamos a cobranca mensal do plano da empresa ${tenantName}.`,
      `Valor cobrado: ${chargeValue}`,
      `Valor do plano (${planName}): ${planValue}/mes`,
      `Data da cobranca: ${paidAtLabel}`,
      periodEndLabel ? `Proxima referencia de ciclo: ${periodEndLabel}` : null,
      'Voce pode acompanhar ou cancelar o plano em Perfil -> Meu plano.',
    ]
      .filter(Boolean)
      .join('\n');

    await this.mailer.sendAutomationEmail({
      to,
      from: getPortalEmailFrom('convert'),
      subject,
      html,
      text,
    });
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

  private formatMoney(value: number, currencyRaw: string): string {
    const amount = Number(value || 0);
    const currency = String(currencyRaw || 'BRL')
      .trim()
      .toUpperCase();
    try {
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: currency || 'BRL',
      }).format(amount);
    } catch {
      return `${amount.toFixed(2)} ${currency || 'BRL'}`;
    }
  }

  private formatDatePtBr(value: Date): string {
    try {
      return value.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    } catch {
      return value.toISOString().slice(0, 10);
    }
  }

  private escapeHtml(value: string): string {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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
