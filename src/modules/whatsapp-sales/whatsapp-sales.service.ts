import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, users } from '@prisma/client';
import OpenAI from 'openai';
import { randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { LeadsService } from '../leads/leads.service';
import { CreateWhatsappIntegrationDto } from './dto/create-whatsapp-integration.dto';
import { UpdateWhatsappIntegrationDto } from './dto/update-whatsapp-integration.dto';
import { ListWhatsappConversationsDto } from './dto/list-whatsapp-conversations.dto';
import { SendWhatsappMessageDto } from './dto/send-whatsapp-message.dto';
import { ProvisionWhatsappIntegrationDto } from './dto/provision-whatsapp-integration.dto';
import { UpdateWhatsappConversationWorkflowDto } from './dto/update-whatsapp-conversation-workflow.dto';
import { CreateWhatsappConversationNoteDto } from './dto/create-whatsapp-conversation-note.dto';
import { UpdateWhatsappConversationConsentDto } from './dto/update-whatsapp-conversation-consent.dto';
import { CreateWhatsappTemplateDto } from './dto/create-whatsapp-template.dto';
import { UpdateWhatsappTemplateDto } from './dto/update-whatsapp-template.dto';
import { CreateWhatsappCampaignDto } from './dto/create-whatsapp-campaign.dto';
import { UpdateWhatsappCampaignDto } from './dto/update-whatsapp-campaign.dto';
import { LaunchWhatsappCampaignDto } from './dto/launch-whatsapp-campaign.dto';
import { runWithTenant } from '../../common/tenant/tenant-context';

type AuthUser = {
  id?: string;
  user_id?: string;
  tenant_id: string;
  role?: string | null;
};

type SettingsJson = {
  businessContext: string;
  assistantTone: string;
  webhookBaseUrl: string;
  providerClientToken: string;
  campaignFooterText: string;
  optOutKeywords: string[];
  classifyWithAi: boolean;
  autoCreateLead: boolean;
  createLeadActivity: boolean;
  notifyTeam: boolean;
  notificationUserIds: string[];
  createLeadOnIntents: string[];
  autoReplyEnabled: boolean;
  autoReplyOnIntents: string[];
  keywordReplyRules: KeywordReplyRule[];
  quickReplyTemplates: QuickReplyTemplate[];
  defaultLeadType: 'PERSON' | 'COMPANY';
  activitySubjectTemplate: string;
};

type KeywordReplyRule = {
  keywords: string[];
  responseText: string;
};

type QuickReplyTemplate = {
  label: string;
  text: string;
};

type ClassificationResult = {
  intent: string;
  confidence: number;
  summary: string;
  needsLead: boolean;
  shouldAutoReply: boolean;
  contactName?: string | null;
  companyName?: string | null;
  email?: string | null;
  requestedService?: string | null;
  responseText?: string | null;
  tags?: string[];
  source: 'AI' | 'HEURISTIC';
};

type NormalizedWebhookMessage = {
  externalMessageId: string | null;
  direction: 'INBOUND' | 'OUTBOUND';
  messageType: string;
  phone: string;
  phoneNormalized: string;
  contactName: string | null;
  contactAvatarUrl: string | null;
  chatId: string | null;
  bodyText: string | null;
  mediaUrl: string | null;
  occurredAt: Date;
  payload: Record<string, unknown>;
};

type ProviderRequestResult = {
  status: number;
  data: any;
};

type ProviderRequestInput = {
  path: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: Record<string, unknown> | null;
};

const DEFAULT_CLASSIFIER_PROMPT = `
Você analisa mensagens recebidas via WhatsApp para um CRM comercial.
Responda somente JSON válido com este formato:
{
  "intent": "BUDGET|QUOTE|PRICE|SUPPORT|FINANCE|GENERAL|SPAM",
  "confidence": 0.0,
  "summary": "resumo curto em português",
  "needsLead": true,
  "shouldAutoReply": false,
  "contactName": null,
  "companyName": null,
  "email": null,
  "requestedService": null,
  "responseText": null,
  "tags": ["tag1"]
}
Considere como lead mensagens com intenção comercial, orçamento, preço, proposta, contratação ou agendamento comercial.
`;

@Injectable()
export class WhatsappSalesService {
  private readonly logger = new Logger(WhatsappSalesService.name);
  private readonly openAiClient: OpenAI | null;
  private readonly defaultAiModel: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly leadsService: LeadsService,
  ) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY')?.trim();
    this.openAiClient = apiKey ? new OpenAI({ apiKey }) : null;
    this.defaultAiModel = this.configService.get<string>('OPENAI_MODEL_AUTOMATION') ?? 'gpt-5-mini';
  }

  async getMeta(user: AuthUser) {
    const providerDefaults = this.getProviderDefaults();
    const [stageRows, currentUserRow] = await Promise.all([
      this.prisma.lead_pipeline_stages.findMany({
        where: { tenant_id: user.tenant_id, is_active: true },
        orderBy: { sort_order: 'asc' },
      }),
      this.prisma.users.findFirst({
        where: {
          tenant_id: user.tenant_id,
          id: this.requireUserId(user),
        },
        select: {
          id: true,
          full_name: true,
          email: true,
          role: true,
          company_id: true,
        },
      }),
    ]);

    const userRows = await this.prisma.users.findMany({
      where: {
        tenant_id: user.tenant_id,
        status: 'ACTIVE',
        company_id: currentUserRow?.company_id ?? null,
      },
      orderBy: { full_name: 'asc' },
      select: {
        id: true,
        full_name: true,
        email: true,
        role: true,
        company_id: true,
      },
    });

    return {
      providers: [
        { value: 'ZAPI', label: 'Z-API' },
        { value: 'IAZAP', label: 'I-zap / IAZAP API' },
      ],
      default_provider: providerDefaults.provider,
      connection_defaults: providerDefaults,
      partner_config: this.getPartnerConfig(),
      public_webhook_base_url: this.resolvePublicWebhookBaseUrl(null),
      settings_defaults: this.defaultSettings(),
      current_user: currentUserRow || {
        id: this.requireUserId(user),
        full_name: null,
        email: null,
        role: user.role ?? null,
        company_id: null,
      },
      conversation_statuses: this.getConversationStatusOptions(),
      consent_statuses: this.getConsentStatusOptions(),
      template_scopes: this.getTemplateScopeOptions(),
      template_categories: this.getTemplateCategoryOptions(),
      campaign_statuses: this.getCampaignStatusOptions(),
      stages: stageRows.map((row) => ({
        id: row.id,
        name: row.name,
        sort_order: row.sort_order,
      })),
      users: userRows.map((row) => ({
        id: row.id,
        full_name: row.full_name,
        email: row.email,
        role: row.role,
        company_id: row.company_id,
      })),
    };
  }

  async listIntegrations(user: AuthUser) {
    const rows = await this.prisma.whatsapp_integrations.findMany({
      where: { tenant_id: user.tenant_id },
      include: {
        default_owner: { select: { id: true, full_name: true, email: true } },
        default_stage: { select: { id: true, name: true } },
      },
      orderBy: { updated_at: 'desc' },
    });

    return rows.map((row) => this.serializeIntegration(row));
  }

  async getIntegration(user: AuthUser, id: string) {
    const row = await this.prisma.whatsapp_integrations.findFirst({
      where: { tenant_id: user.tenant_id, id },
      include: {
        default_owner: { select: { id: true, full_name: true, email: true } },
        default_stage: { select: { id: true, name: true } },
      },
    });

    if (!row) throw new NotFoundException('Integração WhatsApp não encontrada.');
    return this.serializeIntegration(row);
  }

  async sendAutomationMessage(params: {
    tenantId: string;
    integrationId?: string | null;
    phoneNumber: string;
    message: string;
  }) {
    const tenantId = String(params.tenantId || '').trim();
    const message = this.normalizeNullableString(params.message);
    const phone = this.normalizePhone(params.phoneNumber);

    if (!tenantId) {
      throw new BadRequestException('tenantId obrigatorio para envio de WhatsApp.');
    }

    if (!phone) {
      throw new BadRequestException('Numero de telefone obrigatorio para envio de WhatsApp.');
    }

    if (!message) {
      throw new BadRequestException('Mensagem obrigatoria para envio de WhatsApp.');
    }

    const integration = await this.resolveAutomationIntegration(tenantId, params.integrationId);
    const response = await this.sendTextMessage(integration, phone, message);

    return {
      integration_id: integration.id,
      provider: integration.provider,
      status: response.status,
      phone_number: phone,
      message,
      provider_response: response.data,
    };
  }

  async createIntegration(user: AuthUser, dto: CreateWhatsappIntegrationDto) {
    const actorId = this.requireUserId(user);
    await this.assertOwnerAndStage(user.tenant_id, dto.default_owner_user_id, dto.default_stage_id);

    const created = await this.prisma.whatsapp_integrations.create({
      data: {
        id: randomUUID(),
        tenant_id: user.tenant_id,
        name: dto.name.trim(),
        provider: this.normalizeProvider(dto.provider),
        api_base_url: this.normalizeBaseUrl(dto.api_base_url),
        api_key: String(dto.api_key).trim(),
        session_name: this.normalizeNullableString(dto.session_name),
        phone_number: this.normalizeNullableString(dto.phone_number),
        webhook_token: this.generateToken(18),
        webhook_secret: this.normalizeNullableString(dto.webhook_secret) || this.generateToken(12),
        status: 'READY',
        is_active: dto.is_active ?? true,
        default_owner_user_id: dto.default_owner_user_id ?? null,
        default_stage_id: dto.default_stage_id ?? null,
        classifier_prompt: this.normalizeNullableString(dto.classifier_prompt),
        auto_reply_prompt: this.normalizeNullableString(dto.auto_reply_prompt),
        fallback_reply_text: this.normalizeNullableString(dto.fallback_reply_text),
        settings_json: this.normalizeSettings(dto.settings_json) as unknown as Prisma.InputJsonValue,
        created_by_user_id: actorId,
        updated_by_user_id: actorId,
      },
    });

    return this.getIntegration(user, created.id);
  }

  async provisionIntegration(user: AuthUser, dto: ProvisionWhatsappIntegrationDto) {
    const actorId = this.requireUserId(user);
    const partner = this.getPartnerConfig();
    if (!partner.enabled || !partner.token) {
      throw new BadRequestException('Conta parceira da Z-API não configurada no ambiente.');
    }

    await this.assertOwnerAndStage(user.tenant_id, dto.default_owner_user_id, dto.default_stage_id);

    const id = randomUUID();
    const integrationName = this.normalizeNullableString(dto.name) || `WhatsApp Comercial ${new Date().toLocaleDateString('pt-BR')}`;
    const webhookToken = this.generateToken(18);
    const webhookSecret = this.generateToken(12);
    const settings = this.normalizeSettings(dto.settings_json);
    const webhookBaseUrl = this.resolvePublicWebhookBaseUrl(settings.webhookBaseUrl);
    const callbackUrl = `${webhookBaseUrl}/api/sales/whatsapp/webhook/${webhookToken}?secret=${encodeURIComponent(
      webhookSecret,
    )}`;

    const sessionName = this.slugify(integrationName) || `whatsapp-${id.slice(0, 8)}`;

    const partnerResponse = await this.requestPartnerApi({
      method: 'POST',
      path: '/instances/integrator/on-demand',
      body: {
        name: integrationName,
        sessionName,
        receivedAndDeliveryCallbackUrl: callbackUrl,
        receivedCallbackUrl: callbackUrl,
        deliveryCallbackUrl: callbackUrl,
        disconnectedCallbackUrl: callbackUrl,
        connectedCallbackUrl: callbackUrl,
        messageStatusCallbackUrl: callbackUrl,
        businessDevice: true,
        isDevice: false,
        autoReadMessage: true,
        callRejectAuto: true,
      },
    });

    const createdInstanceId =
      this.normalizeNullableString(partnerResponse.data?.id) ||
      this.normalizeNullableString(partnerResponse.data?.instanceId);
    const createdInstanceToken =
      this.normalizeNullableString(partnerResponse.data?.token) ||
      this.normalizeNullableString(partnerResponse.data?.instanceToken);

    if (!createdInstanceId || !createdInstanceToken) {
      throw new InternalServerErrorException('A Z-API não retornou o id/token da nova instância.');
    }

    let subscriptionResponse: ProviderRequestResult | null = null;
    if (partner.auto_subscribe) {
      subscriptionResponse = await this.requestPartnerApi({
        method: 'POST',
        path: `/instances/${encodeURIComponent(createdInstanceId)}/token/${encodeURIComponent(
          createdInstanceToken,
        )}/integrator/on-demand/subscription`,
      });
    }

    await this.prisma.whatsapp_integrations.create({
      data: {
        id,
        tenant_id: user.tenant_id,
        name: integrationName,
        provider: 'ZAPI',
        api_base_url: partner.base_url,
        api_key: createdInstanceToken,
        session_name: createdInstanceId,
        phone_number: this.normalizeNullableString(dto.phone_number),
        webhook_token: webhookToken,
        webhook_secret: webhookSecret,
        status: 'PENDING',
        is_active: dto.is_active ?? true,
        default_owner_user_id: dto.default_owner_user_id ?? null,
        default_stage_id: dto.default_stage_id ?? null,
        classifier_prompt: this.normalizeNullableString(dto.classifier_prompt),
        auto_reply_prompt: this.normalizeNullableString(dto.auto_reply_prompt),
        fallback_reply_text: this.normalizeNullableString(dto.fallback_reply_text),
        settings_json: {
          ...(settings as unknown as Record<string, unknown>),
          webhookBaseUrl: webhookBaseUrl,
        } as Prisma.InputJsonValue,
        created_by_user_id: actorId,
        updated_by_user_id: actorId,
        last_connection_payload: {
          provision: partnerResponse.data,
          subscription: subscriptionResponse?.data || null,
        } as Prisma.InputJsonValue,
      },
    });

    return this.getIntegration(user, id);
  }

  async updateIntegration(user: AuthUser, id: string, dto: UpdateWhatsappIntegrationDto) {
    const actorId = this.requireUserId(user);
    const existing = await this.prisma.whatsapp_integrations.findFirst({
      where: { tenant_id: user.tenant_id, id },
    });

    if (!existing) throw new NotFoundException('Integração WhatsApp não encontrada.');
    await this.assertOwnerAndStage(user.tenant_id, dto.default_owner_user_id, dto.default_stage_id);

    await this.prisma.whatsapp_integrations.update({
      where: { id: existing.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.provider !== undefined ? { provider: this.normalizeProvider(dto.provider) } : {}),
        ...(dto.api_base_url !== undefined ? { api_base_url: this.normalizeBaseUrl(dto.api_base_url) } : {}),
        ...(dto.api_key !== undefined && String(dto.api_key).trim()
          ? { api_key: String(dto.api_key).trim() }
          : {}),
        ...(dto.session_name !== undefined ? { session_name: this.normalizeNullableString(dto.session_name) } : {}),
        ...(dto.phone_number !== undefined ? { phone_number: this.normalizeNullableString(dto.phone_number) } : {}),
        ...(dto.webhook_secret !== undefined ? { webhook_secret: this.normalizeNullableString(dto.webhook_secret) } : {}),
        ...(dto.is_active !== undefined ? { is_active: dto.is_active } : {}),
        ...(dto.default_owner_user_id !== undefined ? { default_owner_user_id: dto.default_owner_user_id || null } : {}),
        ...(dto.default_stage_id !== undefined ? { default_stage_id: dto.default_stage_id || null } : {}),
        ...(dto.classifier_prompt !== undefined ? { classifier_prompt: this.normalizeNullableString(dto.classifier_prompt) } : {}),
        ...(dto.auto_reply_prompt !== undefined ? { auto_reply_prompt: this.normalizeNullableString(dto.auto_reply_prompt) } : {}),
        ...(dto.fallback_reply_text !== undefined ? { fallback_reply_text: this.normalizeNullableString(dto.fallback_reply_text) } : {}),
        ...(dto.settings_json !== undefined
          ? { settings_json: this.normalizeSettings(dto.settings_json) as unknown as Prisma.InputJsonValue }
          : {}),
        updated_by_user_id: actorId,
        updated_at: new Date(),
      },
    });

    return this.getIntegration(user, id);
  }

  async connectIntegration(user: AuthUser, id: string, dto: SendWhatsappMessageDto) {
    const integration = await this.getIntegrationRow(user.tenant_id, id);
    const webhookUrl = this.buildWebhookUrl(integration, dto.webhook_base_url);
    const provider = this.normalizeProvider(integration.provider);

    if (provider === 'ZAPI') {
      const webhookResponse = await this.requestProvider(integration, {
        method: 'PUT',
        path: '/update-every-webhooks',
        body: {
          value: webhookUrl,
          notifySentByMe: true,
        },
      });

      let statusResponse: ProviderRequestResult | null = null;
      try {
        statusResponse = await this.requestProvider(integration, {
          method: 'GET',
          path: '/status',
        });
      } catch {
        statusResponse = null;
      }

      const connectionPayload = {
        webhook: webhookResponse.data,
        status: statusResponse?.data || null,
      };

      await this.prisma.whatsapp_integrations.update({
        where: { id: integration.id },
        data: {
          status: statusResponse?.data?.connected ? 'CONNECTED' : 'PENDING',
          last_connection_at: new Date(),
          last_connection_payload: connectionPayload as Prisma.InputJsonValue,
          updated_at: new Date(),
        },
      });

      return {
        webhook_url: webhookUrl,
        provider_response: connectionPayload,
        provider_status: statusResponse?.status || webhookResponse.status,
      };
    }

    const sessionName =
      this.normalizeNullableString(integration.session_name) ||
      this.slugify(integration.name) ||
      `session-${integration.id.slice(0, 8)}`;

    const response = await this.requestProvider(integration, {
      method: 'POST',
      path: '/connection/connect',
      body: {
        session: sessionName,
        webhook_url: webhookUrl,
      },
    });

    await this.prisma.whatsapp_integrations.update({
      where: { id: integration.id },
      data: {
        status: response.status >= 200 && response.status < 300 ? 'CONNECTED' : 'ERROR',
        last_connection_at: new Date(),
        last_connection_payload: response.data as Prisma.InputJsonValue,
        updated_at: new Date(),
      },
    });

    return {
      webhook_url: webhookUrl,
      provider_response: response.data,
      provider_status: response.status,
    };
  }

  async sendTestMessage(user: AuthUser, id: string, dto: SendWhatsappMessageDto) {
    const integration = await this.getIntegrationRow(user.tenant_id, id);
    const phone = this.normalizePhone(dto.phone_number);
    if (!phone) throw new BadRequestException('Informe um telefone para teste.');

    const response = await this.sendTextMessage(integration, phone, dto.message);
    await this.saveOutboundMessage({
      integration,
      phone,
      contactName: null,
      chatId: null,
      externalMessageId: this.extractProviderMessageId(response.data),
      bodyText: dto.message,
      messageType: 'TEXT',
      mediaUrl: null,
      providerPayload: response.data,
    });

    return {
      provider_status: response.status,
      provider_response: response.data,
    };
  }

  async getIntegrationQrCode(user: AuthUser, id: string) {
    const integration = await this.getIntegrationRow(user.tenant_id, id);
    const provider = this.normalizeProvider(integration.provider);
    if (provider !== 'ZAPI') {
      throw new BadRequestException('QR Code disponível apenas para integrações Z-API.');
    }

    const [statusResponse, meResponse, qrResponse] = await Promise.all([
      this.requestProvider(integration, { method: 'GET', path: '/status' }).catch((error) => ({
        status: 0,
        data: { error: this.extractErrorMessage(error) },
      })),
      this.requestProvider(integration, { method: 'GET', path: '/device' }).catch((error) => ({
        status: 0,
        data: { error: this.extractErrorMessage(error) },
      })),
      this.requestProvider(integration, { method: 'GET', path: '/qr-code/image' }).catch((error) => ({
        status: 0,
        data: { error: this.extractErrorMessage(error) },
      })),
    ]);

    const qrPayload = qrResponse?.data;
    const rawQrCode =
      this.normalizeNullableString(qrPayload?.value) ||
      this.normalizeNullableString(qrPayload?.qrCode) ||
      this.normalizeNullableString(qrPayload?.image) ||
      this.normalizeNullableString(qrPayload?.base64) ||
      this.normalizeNullableString(qrPayload?.message) ||
      this.normalizeNullableString(qrPayload?.data) ||
      this.normalizeNullableString(qrPayload?.error);
    const qrCode = this.looksLikeQrImagePayload(rawQrCode) ? rawQrCode : null;

    return {
      connected: Boolean(statusResponse?.data?.connected || meResponse?.data?.connected),
      status: statusResponse?.data || null,
      instance: meResponse?.data || null,
      qr_code: qrCode,
      qr_error: qrCode ? null : rawQrCode,
    };
  }

  async listConversations(user: AuthUser, query: ListWhatsappConversationsDto) {
    const ownership = this.normalizeNullableString(query.ownership)?.toUpperCase();
    const where: Prisma.whatsapp_conversationsWhereInput = {
      tenant_id: user.tenant_id,
      ...(query.integration_id ? { integration_id: query.integration_id } : {}),
      ...(query.status ? { status: String(query.status).trim().toUpperCase() } : {}),
      ...(query.owner_user_id ? { owner_user_id: query.owner_user_id } : {}),
      ...(ownership === 'MINE' ? { owner_user_id: this.requireUserId(user) } : {}),
      ...(ownership === 'UNASSIGNED' ? { owner_user_id: null } : {}),
      ...(query.intent ? { classification_intent: String(query.intent).trim().toUpperCase() } : {}),
      ...(query.lead_linked === 'true' ? { lead_id: { not: null } } : {}),
      ...(query.lead_linked === 'false' ? { lead_id: null } : {}),
      ...(query.q
        ? {
            OR: [
              { contact_name: { contains: query.q, mode: 'insensitive' } },
              { contact_phone: { contains: query.q } },
              { last_message_preview: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.whatsapp_conversations.findMany({
      where,
      include: {
        lead: { select: { id: true, name: true, status: true } },
        integration: { select: { id: true, name: true, phone_number: true } },
        owner_user: { select: { id: true, full_name: true, email: true } },
        _count: { select: { notes: true } },
      },
      orderBy: [{ last_message_at: 'desc' }],
      take: 100,
    });

    return rows.map((row) => this.serializeConversation(row));
  }

  async getConversation(user: AuthUser, id: string) {
    let row = await this.prisma.whatsapp_conversations.findFirst({
      where: { tenant_id: user.tenant_id, id },
      include: {
        lead: { select: { id: true, name: true, status: true, owner_user_id: true } },
        integration: { select: { id: true, name: true, phone_number: true, is_active: true } },
        owner_user: { select: { id: true, full_name: true, email: true } },
        _count: { select: { notes: true } },
      },
    });

    if (!row) throw new NotFoundException('Conversa não encontrada.');
    if (row.unread_count > 0) {
      row = await this.prisma.whatsapp_conversations.update({
        where: { id: row.id },
        data: {
          unread_count: 0,
          updated_at: new Date(),
        },
        include: {
          lead: { select: { id: true, name: true, status: true, owner_user_id: true } },
          integration: { select: { id: true, name: true, phone_number: true, is_active: true } },
          owner_user: { select: { id: true, full_name: true, email: true } },
          _count: { select: { notes: true } },
        },
      });
    }

    return this.serializeConversation(row);
  }

  async listMessages(user: AuthUser, conversationId: string) {
    const conversation = await this.prisma.whatsapp_conversations.findFirst({
      where: { tenant_id: user.tenant_id, id: conversationId },
    });
    if (!conversation) throw new NotFoundException('Conversa não encontrada.');

    const rows = await this.prisma.whatsapp_messages.findMany({
      where: { tenant_id: user.tenant_id, conversation_id: conversationId },
      orderBy: { created_at: 'asc' },
      take: 250,
    });

    return rows.map((row) => this.serializeMessage(row));
  }

  async updateConversationWorkflow(user: AuthUser, conversationId: string, dto: UpdateWhatsappConversationWorkflowDto) {
    const conversation = await this.getConversationRow(user.tenant_id, conversationId);
    const data: Prisma.whatsapp_conversationsUpdateInput = {
      updated_at: new Date(),
    };

    if (dto.owner_user_id !== undefined) {
      const ownerUserId = this.normalizeNullableString(dto.owner_user_id);
      if (ownerUserId) {
        await this.assertConversationOwner(user.tenant_id, ownerUserId);
      }
      data.owner_user = ownerUserId ? { connect: { id: ownerUserId } } : { disconnect: true };
      data.claimed_at = ownerUserId ? new Date() : null;
    }

    if (dto.status !== undefined) {
      data.status = this.normalizeConversationStatus(dto.status, conversation.status);
    }

    const updated = await this.prisma.whatsapp_conversations.update({
      where: { id: conversation.id },
      data,
      include: {
        lead: { select: { id: true, name: true, status: true, owner_user_id: true } },
        integration: { select: { id: true, name: true, phone_number: true, is_active: true } },
        owner_user: { select: { id: true, full_name: true, email: true } },
        _count: { select: { notes: true } },
      },
    });

    return this.serializeConversation(updated);
  }

  async claimConversation(user: AuthUser, conversationId: string) {
    const actorId = this.requireUserId(user);
    const conversation = await this.getConversationRow(user.tenant_id, conversationId);
    const updated = await this.prisma.whatsapp_conversations.update({
      where: { id: conversation.id },
      data: {
        owner_user: { connect: { id: actorId } },
        claimed_at: new Date(),
        status: this.resolveConversationStatusAfterClaim(conversation.status),
        updated_at: new Date(),
      },
      include: {
        lead: { select: { id: true, name: true, status: true, owner_user_id: true } },
        integration: { select: { id: true, name: true, phone_number: true, is_active: true } },
        owner_user: { select: { id: true, full_name: true, email: true } },
        _count: { select: { notes: true } },
      },
    });

    return this.serializeConversation(updated);
  }

  async releaseConversation(user: AuthUser, conversationId: string) {
    const conversation = await this.getConversationRow(user.tenant_id, conversationId);
    const updated = await this.prisma.whatsapp_conversations.update({
      where: { id: conversation.id },
      data: {
        owner_user: { disconnect: true },
        claimed_at: null,
        updated_at: new Date(),
      },
      include: {
        lead: { select: { id: true, name: true, status: true, owner_user_id: true } },
        integration: { select: { id: true, name: true, phone_number: true, is_active: true } },
        owner_user: { select: { id: true, full_name: true, email: true } },
        _count: { select: { notes: true } },
      },
    });

    return this.serializeConversation(updated);
  }

  async listConversationNotes(user: AuthUser, conversationId: string) {
    await this.getConversationRow(user.tenant_id, conversationId);
    const rows = await this.prisma.whatsapp_conversation_notes.findMany({
      where: { tenant_id: user.tenant_id, conversation_id: conversationId },
      include: {
        user: { select: { id: true, full_name: true, email: true } },
      },
      orderBy: { created_at: 'desc' },
      take: 50,
    });

    return rows.map((row) => this.serializeConversationNote(row));
  }

  async addConversationNote(user: AuthUser, conversationId: string, dto: CreateWhatsappConversationNoteDto) {
    const actorId = this.requireUserId(user);
    const conversation = await this.getConversationRow(user.tenant_id, conversationId);
    const noteText = this.normalizeNullableString(dto.note_text);
    if (!noteText) {
      throw new BadRequestException('A nota interna nao pode ficar vazia.');
    }

    const now = new Date();
    const created = await this.prisma.whatsapp_conversation_notes.create({
      data: {
        id: randomUUID(),
        tenant_id: user.tenant_id,
        conversation_id: conversation.id,
        user_id: actorId,
        note_text: noteText,
        created_at: now,
        updated_at: now,
      },
      include: {
        user: { select: { id: true, full_name: true, email: true } },
      },
    });

    await this.prisma.whatsapp_conversations.update({
      where: { id: conversation.id },
      data: {
        last_note_at: now,
        ...(conversation.owner_user_id ? {} : { owner_user_id: actorId }),
        claimed_at: conversation.owner_user_id ? conversation.claimed_at : now,
        updated_at: now,
      },
    });

    return this.serializeConversationNote(created);
  }

  async updateConversationConsent(user: AuthUser, conversationId: string, dto: UpdateWhatsappConversationConsentDto) {
    const conversation = await this.getConversationRow(user.tenant_id, conversationId);
    const nextStatus = this.normalizeConsentStatus(dto.marketing_opt_in_status, conversation.marketing_opt_in_status);
    const now = new Date();

    await this.prisma.whatsapp_conversations.update({
      where: { id: conversation.id },
      data: {
        marketing_opt_in_status: nextStatus,
        marketing_opt_in_source:
          dto.marketing_opt_in_source !== undefined
            ? this.normalizeNullableString(dto.marketing_opt_in_source)
            : conversation.marketing_opt_in_source,
        marketing_opt_in_at:
          nextStatus === 'OPTED_IN'
            ? conversation.marketing_opt_in_at ?? now
            : nextStatus === 'UNKNOWN'
              ? null
              : conversation.marketing_opt_in_at,
        marketing_opt_out_at:
          nextStatus === 'OPTED_OUT'
            ? now
            : nextStatus === 'UNKNOWN'
              ? null
              : conversation.marketing_opt_out_at,
        updated_at: now,
      },
    });

    return this.getConversation(user, conversation.id);
  }

  async listTemplates(user: AuthUser, integrationId?: string) {
    const rows = await this.prisma.whatsapp_message_templates.findMany({
      where: {
        tenant_id: user.tenant_id,
        ...(integrationId ? { OR: [{ integration_id: integrationId }, { integration_id: null }] } : {}),
      },
      include: {
        integration: { select: { id: true, name: true, phone_number: true } },
      },
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
    });

    return rows.map((row) => this.serializeTemplate(row));
  }

  async createTemplate(user: AuthUser, dto: CreateWhatsappTemplateDto) {
    const actorId = this.requireUserId(user);
    const name = String(dto.name || '').trim();
    const messageText = String(dto.message_text || '').trim();
    if (!name || !messageText) {
      throw new BadRequestException('Nome e mensagem do template sao obrigatorios.');
    }
    if (dto.integration_id) {
      await this.getIntegrationRow(user.tenant_id, dto.integration_id);
    }

    const created = await this.prisma.whatsapp_message_templates.create({
      data: {
        id: randomUUID(),
        tenant_id: user.tenant_id,
        integration_id: this.normalizeNullableString(dto.integration_id),
        name,
        category: this.normalizeTemplateCategory(dto.category),
        usage_scope: this.normalizeTemplateScope(dto.usage_scope),
        message_text: messageText,
        variables_json: this.normalizeTemplateVariables(dto.variables_json) as Prisma.InputJsonValue,
        is_active: dto.is_active ?? true,
        sort_order: Number.isFinite(Number(dto.sort_order)) ? Number(dto.sort_order) : 0,
        created_by_user_id: actorId,
        updated_by_user_id: actorId,
        created_at: new Date(),
        updated_at: new Date(),
      },
      include: {
        integration: { select: { id: true, name: true, phone_number: true } },
      },
    });

    return this.serializeTemplate(created);
  }

  async updateTemplate(user: AuthUser, id: string, dto: UpdateWhatsappTemplateDto) {
    const actorId = this.requireUserId(user);
    const existing = await this.getTemplateRow(user.tenant_id, id);
    if (dto.integration_id) {
      await this.getIntegrationRow(user.tenant_id, dto.integration_id);
    }
    if (dto.name !== undefined && !String(dto.name || '').trim()) {
      throw new BadRequestException('Nome do template nao pode ficar vazio.');
    }
    if (dto.message_text !== undefined && !String(dto.message_text || '').trim()) {
      throw new BadRequestException('Mensagem do template nao pode ficar vazia.');
    }

    const updated = await this.prisma.whatsapp_message_templates.update({
      where: { id: existing.id },
      data: {
        ...(dto.integration_id !== undefined ? { integration_id: this.normalizeNullableString(dto.integration_id) } : {}),
        ...(dto.name !== undefined ? { name: String(dto.name || '').trim() } : {}),
        ...(dto.category !== undefined ? { category: this.normalizeTemplateCategory(dto.category) } : {}),
        ...(dto.usage_scope !== undefined ? { usage_scope: this.normalizeTemplateScope(dto.usage_scope) } : {}),
        ...(dto.message_text !== undefined ? { message_text: String(dto.message_text || '').trim() } : {}),
        ...(dto.variables_json !== undefined
          ? { variables_json: this.normalizeTemplateVariables(dto.variables_json) as Prisma.InputJsonValue }
          : {}),
        ...(dto.is_active !== undefined ? { is_active: dto.is_active } : {}),
        ...(dto.sort_order !== undefined && Number.isFinite(Number(dto.sort_order))
          ? { sort_order: Number(dto.sort_order) }
          : {}),
        updated_by_user_id: actorId,
        updated_at: new Date(),
      },
      include: {
        integration: { select: { id: true, name: true, phone_number: true } },
      },
    });

    return this.serializeTemplate(updated);
  }

  async listCampaigns(user: AuthUser, integrationId?: string) {
    const rows = await this.prisma.whatsapp_campaigns.findMany({
      where: {
        tenant_id: user.tenant_id,
        ...(integrationId ? { integration_id: integrationId } : {}),
      },
      include: {
        integration: { select: { id: true, name: true, phone_number: true } },
        template: { select: { id: true, name: true, usage_scope: true } },
        _count: { select: { recipients: true } },
      },
      orderBy: [{ updated_at: 'desc' }],
      take: 50,
    });

    return rows.map((row) => this.serializeCampaign(row));
  }

  async getCampaign(user: AuthUser, id: string) {
    const row = await this.prisma.whatsapp_campaigns.findFirst({
      where: { tenant_id: user.tenant_id, id },
      include: {
        integration: { select: { id: true, name: true, phone_number: true } },
        template: { select: { id: true, name: true, usage_scope: true } },
        recipients: {
          include: {
            conversation: {
              select: {
                id: true,
                contact_name: true,
                contact_phone: true,
                marketing_opt_in_status: true,
                lead_id: true,
              },
            },
          },
          orderBy: [{ created_at: 'asc' }],
        },
        _count: { select: { recipients: true } },
      },
    });
    if (!row) throw new NotFoundException('Campanha WhatsApp nao encontrada.');
    return this.serializeCampaign(row, true);
  }

  async createCampaign(user: AuthUser, dto: CreateWhatsappCampaignDto) {
    const actorId = this.requireUserId(user);
    const integration = await this.getIntegrationRow(user.tenant_id, dto.integration_id);
    const template = dto.template_id ? await this.getTemplateRow(user.tenant_id, dto.template_id) : null;
    const campaignName = String(dto.name || '').trim();
    if (!campaignName) {
      throw new BadRequestException('Nome da campanha obrigatorio.');
    }
    const messageText = this.resolveCampaignMessageText(dto.message_text, template?.message_text);

    const created = await this.prisma.transaction(async (tx) => {
      const campaign = await tx.whatsapp_campaigns.create({
        data: {
          id: randomUUID(),
          tenant_id: user.tenant_id,
          integration_id: integration.id,
          template_id: template?.id || null,
          name: campaignName,
          status: 'DRAFT',
          audience_mode: this.normalizeAudienceMode(dto.audience_mode),
          message_text: messageText,
          filters_json: this.normalizePlainObject(dto.filters_json) as Prisma.InputJsonValue,
          created_by_user_id: actorId,
          updated_by_user_id: actorId,
          created_at: new Date(),
          updated_at: new Date(),
        },
      });

      await this.replaceCampaignRecipients(tx, user.tenant_id, campaign.id, dto.recipients);
      await this.refreshCampaignMetrics(tx, user.tenant_id, campaign.id);
      return campaign.id;
    });

    return this.getCampaign(user, created);
  }

  async updateCampaign(user: AuthUser, id: string, dto: UpdateWhatsappCampaignDto) {
    const actorId = this.requireUserId(user);
    const existing = await this.getCampaignRow(user.tenant_id, id);
    const integration =
      dto.integration_id !== undefined ? await this.getIntegrationRow(user.tenant_id, dto.integration_id) : null;
    const template = dto.template_id ? await this.getTemplateRow(user.tenant_id, dto.template_id) : null;
    if (dto.name !== undefined && !String(dto.name || '').trim()) {
      throw new BadRequestException('Nome da campanha nao pode ficar vazio.');
    }
    const resolvedMessage =
      dto.message_text !== undefined || dto.template_id !== undefined
        ? this.resolveCampaignMessageText(dto.message_text, template?.message_text, existing.message_text)
        : existing.message_text;

    await this.prisma.transaction(async (tx) => {
      await tx.whatsapp_campaigns.update({
        where: { id: existing.id },
        data: {
          ...(integration ? { integration_id: integration.id } : {}),
          ...(dto.template_id !== undefined ? { template_id: template?.id || null } : {}),
          ...(dto.name !== undefined ? { name: String(dto.name || '').trim() } : {}),
          ...(dto.audience_mode !== undefined ? { audience_mode: this.normalizeAudienceMode(dto.audience_mode) } : {}),
          ...(dto.message_text !== undefined || dto.template_id !== undefined ? { message_text: resolvedMessage } : {}),
          ...(dto.filters_json !== undefined
            ? { filters_json: this.normalizePlainObject(dto.filters_json) as Prisma.InputJsonValue }
            : {}),
          updated_by_user_id: actorId,
          updated_at: new Date(),
        },
      });

      if (dto.recipients !== undefined) {
        await this.replaceCampaignRecipients(tx, user.tenant_id, existing.id, dto.recipients);
      }
      await this.refreshCampaignMetrics(tx, user.tenant_id, existing.id);
    });

    return this.getCampaign(user, existing.id);
  }

  async launchCampaign(user: AuthUser, id: string, dto: LaunchWhatsappCampaignDto) {
    const campaign = await this.prisma.whatsapp_campaigns.findFirst({
      where: { tenant_id: user.tenant_id, id },
      include: {
        integration: true,
        template: true,
        recipients: {
          include: {
            conversation: true,
          },
          orderBy: [{ created_at: 'asc' }],
        },
      },
    });
    if (!campaign) throw new NotFoundException('Campanha WhatsApp nao encontrada.');

    const resendFailed = !!dto?.resend_failed;
    const settings = this.normalizeSettings(campaign.integration.settings_json as Record<string, unknown> | null | undefined);
    const candidates = (campaign.recipients || []).filter((recipient) => {
      if (recipient.send_status === 'SENT') return false;
      if (!resendFailed && recipient.send_status === 'FAILED') return false;
      return true;
    });

    if (!candidates.length) {
      throw new BadRequestException('Nao ha destinatarios pendentes para envio nesta campanha.');
    }

    await this.prisma.whatsapp_campaigns.update({
      where: { id: campaign.id },
      data: {
        status: 'RUNNING',
        launched_at: campaign.launched_at ?? new Date(),
        finished_at: null,
        last_error: null,
        updated_at: new Date(),
      },
    });

    const result = { sent: 0, failed: 0, skipped: 0, errors: [] as string[] };

    for (const recipient of candidates) {
      try {
        const liveConversation = recipient.conversation_id
          ? await this.prisma.whatsapp_conversations.findFirst({
              where: { tenant_id: user.tenant_id, id: recipient.conversation_id },
            })
          : null;
        const effectiveConsent = this.normalizeConsentStatus(
          liveConversation?.marketing_opt_in_status || recipient.snapshot_opt_in_status,
          recipient.snapshot_opt_in_status,
        );

        if (effectiveConsent !== 'OPTED_IN') {
          result.skipped += 1;
          await this.prisma.whatsapp_campaign_recipients.update({
            where: { id: recipient.id },
            data: {
              snapshot_opt_in_status: effectiveConsent,
              send_status: 'SKIPPED',
              last_error: 'Contato sem opt-in para campanhas outbound.',
              updated_at: new Date(),
            },
          });
          continue;
        }

        const messageText = this.buildCampaignMessageText(campaign, recipient, liveConversation, settings);
        const response = await this.sendTextMessage(
          campaign.integration,
          recipient.phone_number_normalized,
          messageText,
        );
        const externalMessageId = this.extractProviderMessageId(response.data);
        await this.saveOutboundMessage({
          integration: campaign.integration,
          phone: recipient.phone_number_normalized,
          contactName: liveConversation?.contact_name || recipient.contact_name || null,
          chatId: liveConversation?.chat_id || null,
          externalMessageId,
          bodyText: messageText,
          messageType: 'TEXT',
          mediaUrl: null,
          providerPayload: response.data,
          existingConversationId: liveConversation?.id || undefined,
        });

        await this.prisma.whatsapp_campaign_recipients.update({
          where: { id: recipient.id },
          data: {
            snapshot_opt_in_status: effectiveConsent,
            send_status: 'SENT',
            campaign_message_id: externalMessageId,
            sent_at: new Date(),
            last_error: null,
            updated_at: new Date(),
          },
        });
        if (liveConversation?.id) {
          await this.prisma.whatsapp_conversations.update({
            where: { id: liveConversation.id },
            data: {
              last_campaign_at: new Date(),
              updated_at: new Date(),
            },
          });
        }
        result.sent += 1;
      } catch (error) {
        const message = this.extractErrorMessage(error);
        result.failed += 1;
        result.errors.push(`${recipient.phone_number}: ${message}`);
        await this.prisma.whatsapp_campaign_recipients.update({
          where: { id: recipient.id },
          data: {
            send_status: 'FAILED',
            last_error: message,
            updated_at: new Date(),
          },
        });
      }
    }

    await this.prisma.transaction(async (tx) => {
      const metrics = await this.refreshCampaignMetrics(tx, user.tenant_id, campaign.id);
      await tx.whatsapp_campaigns.update({
        where: { id: campaign.id },
        data: {
          status:
            metrics.sent_total > 0 && metrics.failed_total === 0 && metrics.skipped_total === 0
              ? 'COMPLETED'
              : 'PARTIAL',
          finished_at: new Date(),
          last_error: result.errors.length ? result.errors.slice(0, 5).join(' | ') : null,
          updated_at: new Date(),
        },
      });
    });

    return {
      campaign: await this.getCampaign(user, campaign.id),
      result,
    };
  }

  async replyToConversation(user: AuthUser, conversationId: string, dto: SendWhatsappMessageDto) {
    const actorId = this.requireUserId(user);
    const conversation = await this.prisma.whatsapp_conversations.findFirst({
      where: { tenant_id: user.tenant_id, id: conversationId },
      include: { integration: true },
    });
    if (!conversation) throw new NotFoundException('Conversa não encontrada.');

    const response = await this.sendTextMessage(
      conversation.integration,
      conversation.contact_phone_normalized,
      dto.message,
    );

    const saved = await this.saveOutboundMessage({
      integration: conversation.integration,
      phone: conversation.contact_phone_normalized,
      contactName: conversation.contact_name,
      chatId: conversation.chat_id,
      externalMessageId: this.extractProviderMessageId(response.data),
      bodyText: dto.message,
      messageType: 'TEXT',
      mediaUrl: null,
      providerPayload: response.data,
      existingConversationId: conversation.id,
    });

    await this.prisma.whatsapp_conversations.update({
      where: { id: conversation.id },
      data: {
        owner_user: { connect: { id: actorId } },
        claimed_at: conversation.claimed_at ?? new Date(),
        last_replied_at: new Date(),
        unread_count: 0,
        status: this.resolveConversationStatusAfterReply(conversation.status),
        updated_at: new Date(),
      },
    });

    return {
      message: this.serializeMessage(saved),
      provider_status: response.status,
      provider_response: response.data,
    };
  }

  async reprocessConversation(user: AuthUser, conversationId: string) {
    const conversation = await this.prisma.whatsapp_conversations.findFirst({
      where: { tenant_id: user.tenant_id, id: conversationId },
      include: { integration: true },
    });
    if (!conversation) throw new NotFoundException('Conversa não encontrada.');

    const lastInbound = await this.prisma.whatsapp_messages.findFirst({
      where: {
        tenant_id: user.tenant_id,
        conversation_id: conversationId,
        direction: 'INBOUND',
      },
      orderBy: { created_at: 'desc' },
    });

    if (!lastInbound) {
      throw new BadRequestException('Nenhuma mensagem recebida encontrada para reprocessar.');
    }

    const updatedConversation = await this.processInboundAutomation(conversation.integration, conversation, lastInbound);
    return this.serializeConversation(updatedConversation);
  }

  async handleWebhook(webhookToken: string, querySecret: string | undefined, payload: Record<string, unknown>) {
    const integration = await this.prisma.unscoped.whatsapp_integrations.findFirst({
      where: {
        webhook_token: webhookToken,
        is_active: true,
      },
    });

    if (!integration) {
      throw new NotFoundException('Webhook WhatsApp não encontrado.');
    }

    return runWithTenant(integration.tenant_id, async () =>
      this.handleWebhookWithinTenant(integration, querySecret, payload),
    );

    /*
    this.assertWebhookSecret(integration, querySecret, payload);
    const receivedAt = new Date();
    this.logger.log(
      `Webhook recebido integration=${integration.id} provider=${integration.provider} keys=${Object.keys(payload || {}).join(',')}`,
    );

    const normalized = this.normalizeWebhookPayload(integration, payload);
    if (!normalized) {
      await this.storeWebhookDebug(integration, {
        received_at: receivedAt.toISOString(),
        status: 'IGNORED',
        reason: 'Payload sem mensagem utilizÃ¡vel.',
        callback_type: this.normalizeNullableString(payload.type),
        payload,
      });
      this.logger.warn(`Webhook ignorado integration=${integration.id} reason=payload-sem-mensagem-utilizavel`);
      return {
        ok: true,
        ignored: true,
        reason: 'Payload sem mensagem utilizável.',
      };
    }

    if (normalized.externalMessageId) {
      const duplicated = await this.prisma.whatsapp_messages.findFirst({
        where: {
          tenant_id: integration.tenant_id,
          integration_id: integration.id,
          external_message_id: normalized.externalMessageId,
        },
        select: { id: true },
      });

      if (duplicated) {
        await this.storeWebhookDebug(integration, {
          received_at: receivedAt.toISOString(),
          status: 'DUPLICATED',
          direction: normalized.direction,
          external_message_id: normalized.externalMessageId,
          phone: normalized.phoneNormalized,
          payload,
        });
        this.logger.log(
          `Webhook duplicado integration=${integration.id} externalMessageId=${normalized.externalMessageId}`,
        );
        return { ok: true, duplicated: true, message_id: duplicated.id };
      }
    }

    const conversation = await this.upsertConversationFromWebhook(integration, normalized);
    const message = await this.prisma.whatsapp_messages.create({
      data: {
        id: randomUUID(),
        tenant_id: integration.tenant_id,
        integration_id: integration.id,
        conversation_id: conversation.id,
        external_message_id: normalized.externalMessageId,
        direction: normalized.direction,
        message_type: normalized.messageType,
        body_text: normalized.bodyText,
        media_url: normalized.mediaUrl,
        sender_phone: normalized.direction === 'INBOUND' ? normalized.phone : integration.phone_number,
        recipient_phone: normalized.direction === 'INBOUND' ? integration.phone_number : normalized.phone,
        payload_json: normalized.payload as Prisma.InputJsonValue,
        created_at: normalized.occurredAt,
      },
    });

    let processedConversation = conversation;
    if (normalized.direction === 'INBOUND') {
      processedConversation = await this.processInboundAutomation(integration, conversation, message);
    }

    await this.storeWebhookDebug(integration, {
      received_at: receivedAt.toISOString(),
      status: 'PROCESSED',
      direction: normalized.direction,
      external_message_id: normalized.externalMessageId,
      phone: normalized.phoneNormalized,
      body_preview: this.normalizeNullableString(normalized.bodyText)?.slice(0, 180) || null,
      conversation_id: processedConversation.id,
      message_id: message.id,
      classification:
        normalized.direction === 'INBOUND'
          ? {
              intent: processedConversation.classification_intent,
              summary: processedConversation.classification_summary,
              lead_id: processedConversation.lead_id,
            }
          : null,
      payload,
    });
    this.logger.log(
      `Webhook processado integration=${integration.id} direction=${normalized.direction} conversation=${processedConversation.id}`,
    );

    await this.prisma.whatsapp_integrations.update({
      where: { id: integration.id },
      data: {
        ...(normalized.direction === 'INBOUND'
          ? { last_inbound_at: normalized.occurredAt }
          : { last_outbound_at: normalized.occurredAt }),
        updated_at: new Date(),
      },
    });

    return {
      ok: true,
      conversation_id: processedConversation.id,
      message_id: message.id,
    };
    */
  }

  private async handleWebhookWithinTenant(
    integration: any,
    querySecret: string | undefined,
    payload: Record<string, unknown>,
  ) {
    this.assertWebhookSecret(integration, querySecret, payload);
    const receivedAt = new Date();
    this.logger.log(
      `Webhook recebido integration=${integration.id} provider=${integration.provider} keys=${Object.keys(payload || {}).join(',')}`,
    );

    const normalized = this.normalizeWebhookPayload(integration, payload);
    if (!normalized) {
      await this.storeWebhookDebug(integration, {
        received_at: receivedAt.toISOString(),
        status: 'IGNORED',
        reason: 'Payload sem mensagem utilizÃƒÂ¡vel.',
        callback_type: this.normalizeNullableString(payload.type),
        payload,
      });
      this.logger.warn(`Webhook ignorado integration=${integration.id} reason=payload-sem-mensagem-utilizavel`);
      return {
        ok: true,
        ignored: true,
        reason: 'Payload sem mensagem utilizÃ¡vel.',
      };
    }

    if (normalized.externalMessageId) {
      const duplicated = await this.prisma.whatsapp_messages.findFirst({
        where: {
          tenant_id: integration.tenant_id,
          integration_id: integration.id,
          external_message_id: normalized.externalMessageId,
        },
        select: { id: true },
      });

      if (duplicated) {
        await this.storeWebhookDebug(integration, {
          received_at: receivedAt.toISOString(),
          status: 'DUPLICATED',
          direction: normalized.direction,
          external_message_id: normalized.externalMessageId,
          phone: normalized.phoneNormalized,
          payload,
        });
        this.logger.log(
          `Webhook duplicado integration=${integration.id} externalMessageId=${normalized.externalMessageId}`,
        );
        return { ok: true, duplicated: true, message_id: duplicated.id };
      }
    }

    const conversation = await this.upsertConversationFromWebhook(integration, normalized);
    const message = await this.prisma.whatsapp_messages.create({
      data: {
        id: randomUUID(),
        tenant_id: integration.tenant_id,
        integration_id: integration.id,
        conversation_id: conversation.id,
        external_message_id: normalized.externalMessageId,
        direction: normalized.direction,
        message_type: normalized.messageType,
        body_text: normalized.bodyText,
        media_url: normalized.mediaUrl,
        sender_phone: normalized.direction === 'INBOUND' ? normalized.phone : integration.phone_number,
        recipient_phone: normalized.direction === 'INBOUND' ? integration.phone_number : normalized.phone,
        payload_json: normalized.payload as Prisma.InputJsonValue,
        created_at: normalized.occurredAt,
      },
    });

    let processedConversation = conversation;
    if (normalized.direction === 'INBOUND') {
      processedConversation = await this.processInboundAutomation(integration, conversation, message);
    }

    await this.storeWebhookDebug(integration, {
      received_at: receivedAt.toISOString(),
      status: 'PROCESSED',
      direction: normalized.direction,
      external_message_id: normalized.externalMessageId,
      phone: normalized.phoneNormalized,
      body_preview: this.normalizeNullableString(normalized.bodyText)?.slice(0, 180) || null,
      conversation_id: processedConversation.id,
      message_id: message.id,
      classification:
        normalized.direction === 'INBOUND'
          ? {
              intent: processedConversation.classification_intent,
              summary: processedConversation.classification_summary,
              lead_id: processedConversation.lead_id,
            }
          : null,
      payload,
    });
    this.logger.log(
      `Webhook processado integration=${integration.id} direction=${normalized.direction} conversation=${processedConversation.id}`,
    );

    await this.prisma.whatsapp_integrations.update({
      where: { id: integration.id },
      data: {
        ...(normalized.direction === 'INBOUND'
          ? { last_inbound_at: normalized.occurredAt }
          : { last_outbound_at: normalized.occurredAt }),
        updated_at: new Date(),
      },
    });

    return {
      ok: true,
      conversation_id: processedConversation.id,
      message_id: message.id,
    };
  }

  private async processInboundAutomation(integration: any, conversation: any, message: any) {
    const settings = this.normalizeSettings(integration.settings_json as Record<string, unknown> | null | undefined);
    const now = new Date();
    const shouldOptOut = this.detectOptOutRequest(message.body_text, settings);
    if (shouldOptOut) {
      return this.prisma.whatsapp_conversations.update({
        where: { id: conversation.id },
        data: {
          marketing_opt_in_status: 'OPTED_OUT',
          marketing_opt_in_source: 'WHATSAPP_KEYWORD',
          marketing_opt_out_at: now,
          classification_summary: 'Contato solicitou opt-out para campanhas.',
          updated_at: now,
        },
        include: { lead: true, integration: true, owner_user: true, _count: { select: { notes: true } } },
      });
    }
    const transcriptRows = await this.prisma.whatsapp_messages.findMany({
      where: { tenant_id: integration.tenant_id, conversation_id: conversation.id },
      orderBy: { created_at: 'asc' },
      take: 12,
    });

    const classification = await this.classifyMessage({
      integration,
      settings,
      transcriptRows,
      latestMessage: message,
    });
    const keywordReplyRule = this.resolveKeywordReplyRule(message.body_text, settings);

    const updatedConversation = await this.prisma.whatsapp_conversations.update({
      where: { id: conversation.id },
      data: {
        classification_intent: classification.intent,
        classification_confidence: new Prisma.Decimal(classification.confidence.toFixed(2)),
        classification_summary: classification.summary,
        extracted_json: classification as unknown as Prisma.InputJsonValue,
        last_classified_at: new Date(),
        status:
          classification.needsLead && ['NEW', 'QUALIFIED'].includes(this.normalizeConversationStatus(conversation.status))
            ? 'QUALIFIED'
            : conversation.status,
        updated_at: new Date(),
      },
      include: {
        lead: true,
        integration: true,
        owner_user: true,
        _count: { select: { notes: true } },
      },
    });

    await this.prisma.whatsapp_messages.update({
      where: { id: message.id },
      data: {
        ai_result_json: classification as unknown as Prisma.InputJsonValue,
      },
    });

    let conversationAfterLead: any = updatedConversation;
    if (classification.needsLead && settings.autoCreateLead) {
      conversationAfterLead = await this.captureLeadFromConversation(integration, updatedConversation, classification, message, settings);
    }

    const shouldNotify = settings.notifyTeam && classification.needsLead && !conversationAfterLead.team_notified_at;
    if (shouldNotify) {
      await this.notifyTeam(integration, conversationAfterLead, classification);
      conversationAfterLead = await this.prisma.whatsapp_conversations.update({
        where: { id: conversationAfterLead.id },
        data: {
          team_notified_at: new Date(),
          updated_at: new Date(),
        },
        include: { lead: true, integration: true },
      });
    }

    const alreadyAutoRepliedRecently =
      conversationAfterLead.auto_replied_at &&
      Date.now() - new Date(conversationAfterLead.auto_replied_at).getTime() < 15 * 60 * 1000;

    if (
      settings.autoReplyEnabled &&
      (keywordReplyRule?.responseText || (classification.shouldAutoReply && classification.responseText)) &&
      !alreadyAutoRepliedRecently
    ) {
      const autoReplyText = String(keywordReplyRule?.responseText || classification.responseText || '').trim();
      if (!autoReplyText) return conversationAfterLead;
      const providerResponse = await this.sendTextMessage(
        integration,
        conversationAfterLead.contact_phone_normalized,
        autoReplyText,
      );

      await this.saveOutboundMessage({
        integration,
        phone: conversationAfterLead.contact_phone_normalized,
        contactName: conversationAfterLead.contact_name,
        chatId: conversationAfterLead.chat_id,
        externalMessageId: this.extractProviderMessageId(providerResponse.data),
        bodyText: autoReplyText,
        messageType: 'TEXT',
        mediaUrl: null,
        providerPayload: providerResponse.data,
        existingConversationId: conversationAfterLead.id,
      });

      conversationAfterLead = await this.prisma.whatsapp_conversations.update({
        where: { id: conversationAfterLead.id },
        data: {
          auto_replied_at: new Date(),
          updated_at: new Date(),
        },
        include: { lead: true, integration: true },
      });
    }

    return conversationAfterLead;
  }

  private async captureLeadFromConversation(
    integration: any,
    conversation: any,
    classification: ClassificationResult,
    message: any,
    settings: SettingsJson,
  ) {
    const existingLead = conversation.lead_id
      ? await this.prisma.leads.findFirst({
          where: { tenant_id: integration.tenant_id, id: conversation.lead_id },
        })
      : await this.findLeadByPhone(integration.tenant_id, conversation.contact_phone_normalized);

    if (existingLead) {
      return this.prisma.whatsapp_conversations.update({
        where: { id: conversation.id },
        data: {
          lead_id: existingLead.id,
          lead_created_at: conversation.lead_created_at ?? new Date(),
          ...(!conversation.owner_user_id && integration.default_owner_user_id
            ? { owner_user_id: integration.default_owner_user_id }
            : {}),
          claimed_at:
            conversation.claimed_at ??
            (integration.default_owner_user_id && !conversation.owner_user_id ? new Date() : conversation.claimed_at),
          updated_at: new Date(),
        },
        include: { lead: true, integration: true, owner_user: true, _count: { select: { notes: true } } },
      });
    }

    const owner = await this.resolveOwnerUser(integration.tenant_id, integration.default_owner_user_id);
    if (!owner) {
      throw new InternalServerErrorException('Nenhum usuário ativo disponível para receber leads do WhatsApp.');
    }

    const leadType =
      classification.companyName || settings.defaultLeadType === 'COMPANY' ? 'COMPANY' : 'PERSON';
    const displayName =
      this.normalizeNullableString(classification.contactName) ||
      this.normalizeNullableString(conversation.contact_name) ||
      `Contato ${conversation.contact_phone}`;

    const notesParts = [
      `Origem: WhatsApp (${integration.name})`,
      classification.summary ? `Resumo IA: ${classification.summary}` : '',
      message.body_text ? `Mensagem inicial: ${message.body_text}` : '',
      classification.requestedService ? `Interesse: ${classification.requestedService}` : '',
    ].filter(Boolean);

    const lead = await this.leadsService.createLead(
      {
        id: owner.id,
        user_id: owner.id,
        tenant_id: integration.tenant_id,
        role: owner.role,
      },
      {
        name: displayName,
        type: leadType as any,
        company_name: classification.companyName ?? undefined,
        first_name: displayName,
        email: classification.email ?? undefined,
        phone: conversation.contact_phone,
        source: 'WHATSAPP' as any,
        owner_user_id: owner.id,
        stage_id: integration.default_stage_id ?? undefined,
        notes: notesParts.join('\n'),
      } as any,
    );

    if (settings.createLeadActivity) {
      try {
        await this.leadsService.createActivity(
          {
            id: owner.id,
            user_id: owner.id,
            tenant_id: integration.tenant_id,
            role: owner.role,
          },
          lead.id,
          {
            type: 'WHATSAPP',
            subject: this.renderTemplate(settings.activitySubjectTemplate, {
              name: displayName,
              phone: conversation.contact_phone,
              intent: classification.intent,
            }),
            description: notesParts.join('\n'),
            assigned_to_user_id: owner.id,
          } as any,
        );
      } catch {
        // Best effort activity creation.
      }
    }

    return this.prisma.whatsapp_conversations.update({
      where: { id: conversation.id },
      data: {
        lead_id: lead.id,
        lead_created_at: new Date(),
        status: 'LEAD_CAPTURED',
        ...(conversation.owner_user_id ? {} : { owner_user_id: owner.id }),
        claimed_at: conversation.claimed_at ?? new Date(),
        updated_at: new Date(),
      },
      include: { lead: true, integration: true, owner_user: true, _count: { select: { notes: true } } },
    });
  }

  private async notifyTeam(integration: any, conversation: any, classification: ClassificationResult) {
    const settings = this.normalizeSettings(integration.settings_json as Record<string, unknown> | null | undefined);
    const requestedIds = settings.notificationUserIds.length
      ? settings.notificationUserIds
      : integration.default_owner_user_id
        ? [integration.default_owner_user_id]
        : [];

    const recipients = requestedIds.length
      ? await this.prisma.users.findMany({
          where: {
            tenant_id: integration.tenant_id,
            id: { in: requestedIds },
          },
          select: {
            id: true,
            company_id: true,
          },
        })
      : [];

    const companyIds = Array.from(
      new Set(
        recipients
          .map((row) => this.normalizeNullableString(row.company_id))
          .filter((item): item is string => !!item),
      ),
    );

    if (!companyIds.length) return;

    await this.prisma.notifications.createMany({
      data: companyIds.map((companyId) => ({
        id: randomUUID(),
        tenant_id: integration.tenant_id,
        company_id: companyId,
        title: `Novo contato via WhatsApp: ${conversation.contact_name || conversation.contact_phone}`,
        message:
          classification.summary ||
          `Nova conversa qualificada via WhatsApp com intenção ${classification.intent}.`,
        severity: 'INFO',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      })),
    });
  }

  private async upsertConversationFromWebhook(integration: any, message: NormalizedWebhookMessage) {
    const existing = await this.prisma.whatsapp_conversations.findFirst({
      where: {
        tenant_id: integration.tenant_id,
        integration_id: integration.id,
        contact_phone_normalized: message.phoneNormalized,
      },
      include: { lead: true, integration: true },
    });

    if (existing) {
      return this.prisma.whatsapp_conversations.update({
        where: { id: existing.id },
        data: {
          contact_phone: message.phone,
          contact_name: message.contactName || existing.contact_name,
          contact_avatar_url: message.contactAvatarUrl || existing.contact_avatar_url,
          chat_id: message.chatId || existing.chat_id,
          last_message_preview: message.bodyText || message.mediaUrl || existing.last_message_preview,
          last_message_at: message.occurredAt,
          unread_count: message.direction === 'INBOUND' ? existing.unread_count + 1 : existing.unread_count,
          status:
            message.direction === 'INBOUND'
              ? this.resolveConversationStatusAfterInbound(existing.status)
              : existing.status,
          updated_at: new Date(),
        },
        include: { lead: true, integration: true, owner_user: true, _count: { select: { notes: true } } },
      });
    }

    return this.prisma.whatsapp_conversations.create({
      data: {
        id: randomUUID(),
        tenant_id: integration.tenant_id,
        integration_id: integration.id,
        contact_phone: message.phone,
        contact_phone_normalized: message.phoneNormalized,
        contact_name: message.contactName,
        contact_avatar_url: message.contactAvatarUrl,
        chat_id: message.chatId,
        last_message_preview: message.bodyText || message.mediaUrl,
        first_message_at: message.occurredAt,
        last_message_at: message.occurredAt,
        unread_count: message.direction === 'INBOUND' ? 1 : 0,
        status: 'NEW',
        owner_user_id: integration.default_owner_user_id || null,
        claimed_at: integration.default_owner_user_id ? new Date() : null,
        created_at: message.occurredAt,
        updated_at: new Date(),
      },
      include: { lead: true, integration: true, owner_user: true, _count: { select: { notes: true } } },
    });
  }

  private async saveOutboundMessage(input: {
    integration: any;
    phone: string;
    contactName: string | null;
    chatId: string | null;
    externalMessageId: string | null;
    bodyText: string;
    messageType: string;
    mediaUrl: string | null;
    providerPayload: any;
    existingConversationId?: string;
  }) {
    let conversationId = input.existingConversationId;
    if (!conversationId) {
      const conversation = await this.upsertConversationFromWebhook(input.integration, {
        externalMessageId: input.externalMessageId,
        direction: 'OUTBOUND',
        messageType: input.messageType,
        phone: input.phone,
        phoneNormalized: input.phone,
        contactName: input.contactName,
        contactAvatarUrl: null,
        chatId: input.chatId,
        bodyText: input.bodyText,
        mediaUrl: input.mediaUrl,
        occurredAt: new Date(),
        payload: input.providerPayload || {},
      });
      conversationId = conversation.id;
    }

    const row = await this.prisma.whatsapp_messages.create({
      data: {
        id: randomUUID(),
        tenant_id: input.integration.tenant_id,
        integration_id: input.integration.id,
        conversation_id: conversationId,
        external_message_id: input.externalMessageId,
        direction: 'OUTBOUND',
        message_type: input.messageType,
        body_text: input.bodyText,
        media_url: input.mediaUrl,
        sender_phone: input.integration.phone_number,
        recipient_phone: input.phone,
        payload_json: (input.providerPayload || {}) as Prisma.InputJsonValue,
      },
    });

    await this.prisma.whatsapp_conversations.update({
      where: { id: conversationId },
      data: {
        last_message_preview: input.bodyText || input.mediaUrl,
        last_message_at: new Date(),
        last_replied_at: new Date(),
        updated_at: new Date(),
      },
    });

    await this.prisma.whatsapp_integrations.update({
      where: { id: input.integration.id },
      data: {
        last_outbound_at: new Date(),
        updated_at: new Date(),
      },
    });

    return row;
  }

  private async classifyMessage(input: {
    integration: any;
    settings: SettingsJson;
    transcriptRows: any[];
    latestMessage: any;
  }): Promise<ClassificationResult> {
    const transcript = (input.transcriptRows || [])
      .map((row) => `${row.direction === 'INBOUND' ? 'Cliente' : 'Equipe'}: ${row.body_text || row.media_url || ''}`)
      .filter(Boolean)
      .join('\n');

    const heuristic = this.classifyHeuristically(
      String(input.latestMessage?.body_text || ''),
      input.integration.fallback_reply_text,
    );

    if (!input.settings.classifyWithAi || !this.openAiClient) {
      return heuristic;
    }

    const systemPrompt = [
      DEFAULT_CLASSIFIER_PROMPT.trim(),
      input.settings.businessContext ? `Contexto do negócio:\n${input.settings.businessContext}` : '',
      input.integration.classifier_prompt ? `Regras extras do tenant:\n${input.integration.classifier_prompt}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    const responseText = await this.runAiText({
      model: this.defaultAiModel,
      systemPrompt,
      userPrompt: [
        `Tom desejado: ${input.settings.assistantTone}`,
        `Integração: ${input.integration.name}`,
        `Telefone: ${input.latestMessage?.sender_phone || input.latestMessage?.recipient_phone || '-'}`,
        `Transcrição:\n${transcript || String(input.latestMessage?.body_text || '')}`,
      ].join('\n\n'),
    }).catch(() => '');

    const parsed = this.parseJsonLoose(responseText);
    if (!parsed || typeof parsed !== 'object') {
      return heuristic;
    }

    const candidate = parsed as Record<string, unknown>;
    return {
      intent: this.normalizeIntent(candidate.intent) || heuristic.intent,
      confidence: this.toConfidence(candidate.confidence, heuristic.confidence),
      summary: this.normalizeNullableString(candidate.summary) || heuristic.summary,
      needsLead: this.toBoolean(candidate.needsLead, heuristic.needsLead),
      shouldAutoReply: this.toBoolean(candidate.shouldAutoReply, heuristic.shouldAutoReply),
      contactName: this.normalizeNullableString(candidate.contactName),
      companyName: this.normalizeNullableString(candidate.companyName),
      email: this.normalizeNullableString(candidate.email),
      requestedService: this.normalizeNullableString(candidate.requestedService),
      responseText:
        this.normalizeNullableString(candidate.responseText) ||
        (heuristic.shouldAutoReply ? heuristic.responseText : null),
      tags: Array.isArray(candidate.tags) ? candidate.tags.map((item) => String(item)) : heuristic.tags,
      source: 'AI',
    };
  }

  private classifyHeuristically(messageText: string, fallbackReplyText?: string | null): ClassificationResult {
    const text = String(messageText || '').toLowerCase();
    const budgetTokens = ['orcamento', 'orçamento', 'cotacao', 'cotação', 'preco', 'preço', 'valor', 'proposta'];
    const supportTokens = ['suporte', 'erro', 'problema', 'ajuda', 'bug'];
    const financeTokens = ['boleto', 'pagamento', 'financeiro', 'nota', 'fatura'];
    const spamTokens = ['cassino', 'aposta', 'adult', 'bitcoin', 'investimento garantido'];

    let intent = 'GENERAL';
    let needsLead = false;
    let shouldAutoReply = false;
    let confidence = 0.54;

    if (budgetTokens.some((token) => text.includes(token))) {
      intent = text.includes('preço') || text.includes('preco') ? 'PRICE' : 'BUDGET';
      needsLead = true;
      shouldAutoReply = true;
      confidence = 0.84;
    } else if (supportTokens.some((token) => text.includes(token))) {
      intent = 'SUPPORT';
      confidence = 0.78;
    } else if (financeTokens.some((token) => text.includes(token))) {
      intent = 'FINANCE';
      confidence = 0.76;
    } else if (spamTokens.some((token) => text.includes(token))) {
      intent = 'SPAM';
      confidence = 0.93;
    }

    const contactNameMatch = messageText.match(/meu nome e\s+([a-zA-ZÀ-ÿ ]{2,40})/i);
    const responseText =
      shouldAutoReply
        ? String(fallbackReplyText || 'Olá! Recebemos sua mensagem e nosso time comercial vai continuar o atendimento em breve.')
        : null;

    return {
      intent,
      confidence,
      summary: messageText.slice(0, 180) || 'Mensagem recebida via WhatsApp.',
      needsLead,
      shouldAutoReply,
      contactName: contactNameMatch?.[1]?.trim() || null,
      companyName: null,
      email: this.extractEmail(messageText),
      requestedService: null,
      responseText,
      tags: [intent.toLowerCase()],
      source: 'HEURISTIC',
    };
  }

  private async runAiText(args: { model: string; systemPrompt: string; userPrompt: string }): Promise<string> {
    if (!this.openAiClient) throw new InternalServerErrorException('OPENAI_API_KEY não configurada.');

    const response = await this.openAiClient.responses.create({
      model: args.model,
      input: [
        {
          role: 'system',
          content: args.systemPrompt,
        },
        {
          role: 'user',
          content: args.userPrompt,
        },
      ],
    } as any);

    if (typeof response.output_text === 'string' && response.output_text.trim()) {
      return response.output_text.trim();
    }

    const outputs = Array.isArray((response as any)?.output) ? (response as any).output : [];
    const chunks: string[] = [];
    outputs.forEach((item: any) => {
      const content = Array.isArray(item?.content) ? item.content : [];
      content.forEach((entry: any) => {
        if (typeof entry?.text === 'string') chunks.push(entry.text);
      });
    });
    return chunks.join('\n').trim();
  }

  private buildWebhookUrl(integration: any, overrideBaseUrl?: string) {
    const baseUrl =
      this.resolvePublicWebhookBaseUrl(overrideBaseUrl) ||
      this.resolvePublicWebhookBaseUrl(integration.settings_json?.webhookBaseUrl);
    if (!baseUrl) {
      throw new BadRequestException(
        'Não foi possível montar a URL pública do webhook. Informe uma base pública no setup.',
      );
    }

    const qs = integration.webhook_secret ? `?secret=${encodeURIComponent(integration.webhook_secret)}` : '';
    return `${baseUrl}/api/sales/whatsapp/webhook/${integration.webhook_token}${qs}`;
  }

  private resolvePublicWebhookBaseUrl(overrideBaseUrl?: unknown): string {
    const raw =
      this.normalizeNullableString(overrideBaseUrl) ||
      this.normalizeNullableString(this.configService.get<string>('PUBLIC_WEBHOOK_BASE_URL')) ||
      this.normalizeNullableString(this.configService.get<string>('BACKEND_PUBLIC_BASE_URL')) ||
      this.normalizeNullableString(this.configService.get<string>('BACKEND_API_BASE_URL'));
    return raw ? raw.replace(/\/$/, '').replace(/\/api$/i, '') : '';
  }

  private async requestProvider(integration: any, input: ProviderRequestInput): Promise<ProviderRequestResult> {
    const provider = this.normalizeProvider(integration.provider);
    const baseUrl = this.normalizeBaseUrl(integration.api_base_url);
    const method = input.method || 'POST';
    const path = input.path.startsWith('/') ? input.path : `/${input.path}`;
    const settings = this.normalizeSettings(integration.settings_json as Record<string, unknown> | null | undefined);

    let url = `${baseUrl}${path}`;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };

    if (provider === 'ZAPI') {
      const instanceId = this.normalizeNullableString(integration.session_name);
      if (!instanceId) {
        throw new BadRequestException('Para Z-API, informe o Instance ID no campo Sessão / Instance ID.');
      }

      url = `${baseUrl}/instances/${encodeURIComponent(instanceId)}/token/${encodeURIComponent(
        String(integration.api_key || '').trim(),
      )}${path}`;

      if (settings.providerClientToken) {
        headers['Client-Token'] = settings.providerClientToken;
      }
    } else {
      headers.Authorization = `Bearer ${integration.api_key}`;
    }

    const response = await fetch(url, {
      method,
      headers,
      ...(method === 'GET' || method === 'DELETE' ? {} : { body: JSON.stringify(input.body || {}) }),
    });

    const data = await this.readJsonSafe(response);
    if (!response.ok) {
      const message =
        this.normalizeNullableString(data?.message) ||
        this.normalizeNullableString(data?.error) ||
        `Falha na API do WhatsApp (${response.status}).`;
      throw new BadRequestException(message);
    }

    return {
      status: response.status,
      data,
    };
  }

  private sendTextMessage(integration: any, phoneNumber: string, message: string) {
    const provider = this.normalizeProvider(integration.provider);
    if (provider === 'ZAPI') {
      return this.requestProvider(integration, {
        method: 'POST',
        path: '/send-text',
        body: {
          phone: phoneNumber,
          message,
        },
      });
    }

    return this.requestProvider(integration, {
      method: 'POST',
      path: '/send/text',
      body: {
        phoneNumber,
        message,
      },
    });
  }

  private normalizeWebhookPayload(integration: any, payload: Record<string, unknown>): NormalizedWebhookMessage | null {
    const provider = this.normalizeProvider(integration?.provider);
    if (provider === 'ZAPI') {
      if (
        this.pickBoolean(payload.isGroup) ||
        this.pickBoolean(payload.isNewsletter) ||
        this.pickBoolean(payload.waitingMessage) ||
        this.normalizeNullableString(payload.notification)
      ) {
        return null;
      }

      const callbackType = this.normalizeNullableString(payload.type);
      if (callbackType && callbackType !== 'ReceivedCallback') {
        return null;
      }
    }

    const candidates = [
      payload,
      this.pickObject(payload.data),
      this.pickObject(payload.message),
      Array.isArray(payload.messages) ? this.pickObject(payload.messages[0]) : null,
    ].filter((item): item is Record<string, unknown> => !!item);

    let phone = '';
    let bodyText = '';
    let contactName = '';
    let contactAvatarUrl = '';
    let chatId = '';
    let externalMessageId = '';
    let mediaUrl = '';
    let messageType = '';
    let fromMe = false;
    let occurredAt: Date | null = null;

    for (const item of candidates) {
      phone =
        phone ||
        this.pickString(
          item.phone,
          item.phoneNumber,
          item.from,
          item.sender,
          item.participantPhone,
          item.remoteJid,
          this.pickObject(item.key)?.remoteJid,
        );
      bodyText =
        bodyText ||
        this.pickString(
          item.body,
          item.text,
          item.message,
          this.pickObject(item.text)?.message,
          this.pickObject(item.text)?.body,
          this.pickObject(item.message)?.conversation,
          this.pickObject(this.pickObject(item.message)?.extendedTextMessage)?.text,
          this.pickObject(item.image)?.caption,
          this.pickObject(item.video)?.caption,
          this.pickObject(item.document)?.caption,
          this.pickObject(item.document)?.fileName,
          this.pickObject(item.location)?.description,
        );
      contactName =
        contactName ||
        this.pickString(
          item.chatName,
          item.senderName,
          item.pushName,
          item.notifyName,
          this.pickObject(item.sender)?.name,
        );
      contactAvatarUrl =
        contactAvatarUrl ||
        this.pickString(
          item.profilePictureUrl,
          item.profilePicUrl,
          item.avatar,
          item.photo,
          item.picture,
          this.pickObject(item.contact)?.profilePictureUrl,
          this.pickObject(item.contact)?.profilePicUrl,
          this.pickObject(item.contact)?.avatar,
          this.pickObject(item.sender)?.photo,
          this.pickObject(item.sender)?.avatar,
          this.pickObject(item.sender)?.profilePictureUrl,
          this.pickObject(item.sender)?.profilePicUrl,
          this.pickObject(item.chat)?.imageUrl,
        );
      chatId = chatId || this.pickString(item.chatId, item.remoteJid, this.pickObject(item.key)?.remoteJid);
      externalMessageId = externalMessageId || this.pickString(item.id, item.messageId, this.pickObject(item.key)?.id);
      mediaUrl =
        mediaUrl ||
        this.pickString(
          item.url,
          item.mediaUrl,
          this.pickObject(item.image)?.url,
          this.pickObject(item.image)?.imageUrl,
          this.pickObject(item.video)?.videoUrl,
          this.pickObject(item.document)?.documentUrl,
          this.pickObject(item.audio)?.audioUrl,
          this.pickObject(item.sticker)?.stickerUrl,
        );
      messageType =
        messageType ||
        this.pickString(item.messageType, this.detectStructuredMessageType(item), item.type);
      fromMe = fromMe || this.pickBoolean(item.fromMe, this.pickObject(item.key)?.fromMe);
      occurredAt = occurredAt || this.parseDate(item.momment, item.timestamp, item.messageTimestamp, item.created_at);
    }

    const normalizedPhone = this.normalizePhone(phone);
    if (!normalizedPhone) return null;

    return {
      externalMessageId: this.normalizeNullableString(externalMessageId),
      direction: fromMe ? 'OUTBOUND' : 'INBOUND',
      messageType: (this.normalizeNullableString(messageType) || (mediaUrl ? 'MEDIA' : 'TEXT')).toUpperCase(),
      phone: this.normalizeNullableString(phone) || normalizedPhone,
      phoneNormalized: normalizedPhone,
      contactName: this.normalizeNullableString(contactName),
      contactAvatarUrl: this.normalizeNullableString(contactAvatarUrl),
      chatId: this.normalizeNullableString(chatId),
      bodyText: this.normalizeNullableString(bodyText),
      mediaUrl: this.normalizeNullableString(mediaUrl),
      occurredAt: occurredAt || new Date(),
      payload,
    };
  }

  private defaultSettings(): SettingsJson {
    return {
      businessContext: '',
      assistantTone: 'Consultivo, rápido e cordial',
      webhookBaseUrl: '',
      providerClientToken: '',
      campaignFooterText: 'Para parar de receber mensagens, responda SAIR.',
      optOutKeywords: ['SAIR', 'PARAR', 'STOP', 'CANCELAR', 'REMOVER'],
      classifyWithAi: true,
      autoCreateLead: true,
      createLeadActivity: true,
      notifyTeam: true,
      notificationUserIds: [],
      createLeadOnIntents: ['BUDGET', 'QUOTE', 'PRICE'],
      autoReplyEnabled: false,
      autoReplyOnIntents: ['BUDGET', 'QUOTE', 'PRICE'],
      keywordReplyRules: [],
      quickReplyTemplates: [
        {
          label: 'Qualificar',
          text: 'Perfeito. Para eu te ajudar melhor, me diga seu nome, empresa e o que voce precisa neste momento.',
        },
        {
          label: 'Dashboard',
          text: 'Consigo te ajudar com isso. Me confirme quais indicadores voce quer acompanhar no dashboard.',
        },
        {
          label: 'Relatorio',
          text: 'Posso montar isso. Me diga o periodo, os filtros e qual formato de relatorio voce precisa.',
        },
        {
          label: 'Follow-up',
          text: 'Recebi sua mensagem e vou seguir com o atendimento. Se quiser, ja me envie mais contexto para agilizar.',
        },
      ],
      defaultLeadType: 'PERSON',
      activitySubjectTemplate: 'Novo contato via WhatsApp - {{intent}} - {{phone}}',
    };
  }

  private normalizeSettings(input?: Record<string, unknown> | null): SettingsJson {
    const defaults = this.defaultSettings();
    const source = input && typeof input === 'object' ? input : {};
    return {
      businessContext: this.normalizeNullableString(source.businessContext) || defaults.businessContext,
      assistantTone: this.normalizeNullableString(source.assistantTone) || defaults.assistantTone,
      webhookBaseUrl: this.normalizeNullableString(source.webhookBaseUrl) || defaults.webhookBaseUrl,
      providerClientToken: this.normalizeNullableString(source.providerClientToken) || defaults.providerClientToken,
      campaignFooterText: this.normalizeNullableString(source.campaignFooterText) || defaults.campaignFooterText,
      optOutKeywords: this.normalizeKeywordList(source.optOutKeywords, defaults.optOutKeywords),
      classifyWithAi: this.toBoolean(source.classifyWithAi, defaults.classifyWithAi),
      autoCreateLead: this.toBoolean(source.autoCreateLead, defaults.autoCreateLead),
      createLeadActivity: this.toBoolean(source.createLeadActivity, defaults.createLeadActivity),
      notifyTeam: this.toBoolean(source.notifyTeam, defaults.notifyTeam),
      notificationUserIds: this.normalizeUuidArray(source.notificationUserIds),
      createLeadOnIntents: this.normalizeIntentArray(source.createLeadOnIntents, defaults.createLeadOnIntents),
      autoReplyEnabled: this.toBoolean(source.autoReplyEnabled, defaults.autoReplyEnabled),
      autoReplyOnIntents: this.normalizeIntentArray(source.autoReplyOnIntents, defaults.autoReplyOnIntents),
      keywordReplyRules: this.normalizeKeywordReplyRules(source.keywordReplyRules),
      quickReplyTemplates: this.normalizeQuickReplyTemplates(source.quickReplyTemplates, defaults.quickReplyTemplates),
      defaultLeadType:
        this.normalizeNullableString(source.defaultLeadType) === 'COMPANY' ? 'COMPANY' : defaults.defaultLeadType,
      activitySubjectTemplate:
        this.normalizeNullableString(source.activitySubjectTemplate) || defaults.activitySubjectTemplate,
    };
  }

  private serializeIntegration(row: any) {
    const settings = this.normalizeSettings(row.settings_json);
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      name: row.name,
      provider: row.provider,
      api_base_url: row.api_base_url,
      api_key_masked: this.maskSecret(row.api_key),
      has_api_key: Boolean(this.normalizeNullableString(row.api_key)),
      session_name: row.session_name,
      phone_number: row.phone_number,
      webhook_token: row.webhook_token,
      webhook_secret_masked: this.maskSecret(row.webhook_secret),
      webhook_url_preview: this.safeBuildWebhookPreview(row),
      status: row.status,
      is_active: row.is_active,
      default_owner_user_id: row.default_owner_user_id,
      default_owner: row.default_owner || null,
      default_stage_id: row.default_stage_id,
      default_stage: row.default_stage || null,
      classifier_prompt: row.classifier_prompt,
      auto_reply_prompt: row.auto_reply_prompt,
      fallback_reply_text: row.fallback_reply_text,
      settings_json: settings,
      last_inbound_at: row.last_inbound_at,
      last_outbound_at: row.last_outbound_at,
      last_connection_at: row.last_connection_at,
      last_connection_payload: row.last_connection_payload,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private serializeConversation(row: any) {
    return {
      id: row.id,
      integration_id: row.integration_id,
      contact_phone: row.contact_phone,
      contact_phone_normalized: row.contact_phone_normalized,
      contact_name: row.contact_name,
      contact_avatar_url: row.contact_avatar_url,
      chat_id: row.chat_id,
      last_message_preview: row.last_message_preview,
      first_message_at: row.first_message_at,
      last_message_at: row.last_message_at,
      unread_count: row.unread_count,
      status: row.status,
      marketing_opt_in_status: row.marketing_opt_in_status,
      marketing_opt_in_source: row.marketing_opt_in_source,
      marketing_opt_in_at: row.marketing_opt_in_at,
      marketing_opt_out_at: row.marketing_opt_out_at,
      last_campaign_at: row.last_campaign_at,
      owner_user_id: row.owner_user_id,
      owner_user: row.owner_user || null,
      claimed_at: row.claimed_at,
      last_replied_at: row.last_replied_at,
      last_note_at: row.last_note_at,
      notes_count: Number(row?._count?.notes || 0),
      classification_intent: row.classification_intent,
      classification_confidence: row.classification_confidence,
      classification_summary: row.classification_summary,
      extracted_json: row.extracted_json,
      lead_id: row.lead_id,
      lead: row.lead || null,
      lead_created_at: row.lead_created_at,
      team_notified_at: row.team_notified_at,
      auto_replied_at: row.auto_replied_at,
      integration: row.integration || null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private serializeTemplate(row: any) {
    return {
      id: row.id,
      integration_id: row.integration_id,
      integration: row.integration || null,
      name: row.name,
      category: row.category,
      usage_scope: row.usage_scope,
      message_text: row.message_text,
      variables_json: row.variables_json || [],
      is_active: row.is_active,
      sort_order: row.sort_order,
      created_by_user_id: row.created_by_user_id,
      updated_by_user_id: row.updated_by_user_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private serializeCampaign(row: any, withRecipients = false) {
    return {
      id: row.id,
      integration_id: row.integration_id,
      integration: row.integration || null,
      template_id: row.template_id,
      template: row.template || null,
      name: row.name,
      status: row.status,
      audience_mode: row.audience_mode,
      message_text: row.message_text,
      filters_json: row.filters_json || null,
      launched_at: row.launched_at,
      finished_at: row.finished_at,
      last_error: row.last_error,
      recipients_total: Number(row.recipients_total ?? row?._count?.recipients ?? 0),
      sent_total: Number(row.sent_total || 0),
      failed_total: Number(row.failed_total || 0),
      skipped_total: Number(row.skipped_total || 0),
      created_at: row.created_at,
      updated_at: row.updated_at,
      recipients: withRecipients
        ? (row.recipients || []).map((recipient: any) => ({
            id: recipient.id,
            conversation_id: recipient.conversation_id,
            lead_id: recipient.lead_id,
            phone_number: recipient.phone_number,
            phone_number_normalized: recipient.phone_number_normalized,
            contact_name: recipient.contact_name,
            company_name: recipient.company_name,
            source_label: recipient.source_label,
            snapshot_opt_in_status: recipient.snapshot_opt_in_status,
            send_status: recipient.send_status,
            campaign_message_id: recipient.campaign_message_id,
            last_error: recipient.last_error,
            sent_at: recipient.sent_at,
            delivered_at: recipient.delivered_at,
            created_at: recipient.created_at,
            updated_at: recipient.updated_at,
            conversation: recipient.conversation || null,
          }))
        : undefined,
    };
  }

  private serializeConversationNote(row: any) {
    return {
      id: row.id,
      conversation_id: row.conversation_id,
      user_id: row.user_id,
      note_text: row.note_text,
      user: row.user || null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private serializeMessage(row: any) {
    return {
      id: row.id,
      conversation_id: row.conversation_id,
      external_message_id: row.external_message_id,
      direction: row.direction,
      message_type: row.message_type,
      body_text: row.body_text,
      media_url: row.media_url,
      sender_phone: row.sender_phone,
      recipient_phone: row.recipient_phone,
      ai_result_json: row.ai_result_json,
      delivery_status: row.delivery_status,
      created_at: row.created_at,
    };
  }

  private async getIntegrationRow(tenantId: string, id: string) {
    const row = await this.prisma.whatsapp_integrations.findFirst({
      where: { tenant_id: tenantId, id },
    });
    if (!row) throw new NotFoundException('Integração WhatsApp não encontrada.');
    return row;
  }

  private async getConversationRow(tenantId: string, id: string) {
    const row = await this.prisma.whatsapp_conversations.findFirst({
      where: { tenant_id: tenantId, id },
    });
    if (!row) throw new NotFoundException('Conversa nÃ£o encontrada.');
    return row;
  }

  private async getTemplateRow(tenantId: string, id: string) {
    const row = await this.prisma.whatsapp_message_templates.findFirst({
      where: { tenant_id: tenantId, id },
      include: {
        integration: { select: { id: true, name: true, phone_number: true } },
      },
    });
    if (!row) throw new NotFoundException('Template WhatsApp nao encontrado.');
    return row;
  }

  private async getCampaignRow(tenantId: string, id: string) {
    const row = await this.prisma.whatsapp_campaigns.findFirst({
      where: { tenant_id: tenantId, id },
    });
    if (!row) throw new NotFoundException('Campanha WhatsApp nao encontrada.');
    return row;
  }

  private async resolveAutomationIntegration(tenantId: string, integrationId?: string | null) {
    const informedId = this.normalizeNullableString(integrationId);
    if (informedId) {
      const informed = await this.prisma.whatsapp_integrations.findFirst({
        where: {
          tenant_id: tenantId,
          id: informedId,
          is_active: true,
        },
      });

      if (!informed) {
        throw new NotFoundException('Integracao do WhatsApp nao encontrada para a automacao.');
      }

      return informed;
    }

    const fallback = await this.prisma.whatsapp_integrations.findFirst({
      where: {
        tenant_id: tenantId,
        is_active: true,
      },
      orderBy: [{ status: 'asc' }, { updated_at: 'desc' }],
    });

    if (!fallback) {
      throw new BadRequestException('Voce nao possui instancia de WhatsApp configurada.');
    }

    return fallback;
  }

  private async resolveOwnerUser(tenantId: string, preferredUserId?: string | null): Promise<users | null> {
    const preferred = preferredUserId
      ? await this.prisma.users.findFirst({
          where: {
            tenant_id: tenantId,
            id: preferredUserId,
            status: 'ACTIVE',
          },
        })
      : null;
    if (preferred) return preferred;

    return this.prisma.users.findFirst({
      where: {
        tenant_id: tenantId,
        status: 'ACTIVE',
      },
      orderBy: [{ role: 'asc' }, { created_at: 'asc' }],
    });
  }

  private async findLeadByPhone(tenantId: string, phoneNormalized: string) {
    const rows = await this.prisma.raw.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id
      FROM leads
      WHERE tenant_id = ${tenantId}
        AND regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = ${phoneNormalized}
      ORDER BY created_at DESC
      LIMIT 1
    `);

    const leadId = rows?.[0]?.id;
    if (!leadId) return null;
    return this.prisma.leads.findFirst({
      where: { tenant_id: tenantId, id: leadId },
    });
  }

  private assertWebhookSecret(integration: any, querySecret: string | undefined, payload: Record<string, unknown>) {
    const expected = this.normalizeNullableString(integration.webhook_secret);
    if (!expected) return;

    const informed =
      this.normalizeNullableString(querySecret) ||
      this.pickString(payload.secret, payload.webhook_secret, this.pickObject(payload.headers)?.['x-webhook-secret']);

    if (expected !== informed) {
      throw new ForbiddenException('Webhook secret inválido.');
    }
  }

  private async assertOwnerAndStage(tenantId: string, ownerUserId?: string, stageId?: string) {
    if (ownerUserId) {
      const owner = await this.prisma.users.findFirst({
        where: { tenant_id: tenantId, id: ownerUserId },
        select: { id: true },
      });
      if (!owner) throw new BadRequestException('default_owner_user_id inválido para o tenant.');
    }

    if (stageId) {
      const stage = await this.prisma.lead_pipeline_stages.findFirst({
        where: { tenant_id: tenantId, id: stageId },
        select: { id: true },
      });
      if (!stage) throw new BadRequestException('default_stage_id inválido para o tenant.');
    }
  }

  private async assertConversationOwner(tenantId: string, ownerUserId: string) {
    const owner = await this.prisma.users.findFirst({
      where: { tenant_id: tenantId, id: ownerUserId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!owner) throw new BadRequestException('owner_user_id invalido para o tenant.');
  }

  private requireUserId(user: AuthUser): string {
    const id = this.normalizeNullableString(user.id || user.user_id);
    if (!id) throw new BadRequestException('Usuário autenticado inválido.');
    return id;
  }

  private normalizeProvider(value?: string | null) {
    const raw = (this.normalizeNullableString(value) || 'IAZAP').toUpperCase();
    if (raw === 'Z-API') return 'ZAPI';
    return raw;
  }

  private getConversationStatusOptions() {
    return [
      { value: 'NEW', label: 'Nova' },
      { value: 'QUALIFIED', label: 'Qualificada' },
      { value: 'LEAD_CAPTURED', label: 'Lead criado' },
      { value: 'IN_PROGRESS', label: 'Em atendimento' },
      { value: 'WAITING_CUSTOMER', label: 'Aguardando cliente' },
      { value: 'WON', label: 'Ganha' },
      { value: 'LOST', label: 'Perdida' },
      { value: 'CLOSED', label: 'Encerrada' },
    ];
  }

  private getConsentStatusOptions() {
    return [
      { value: 'UNKNOWN', label: 'Nao definido' },
      { value: 'OPTED_IN', label: 'Opt-in ativo' },
      { value: 'OPTED_OUT', label: 'Opt-out ativo' },
    ];
  }

  private getTemplateScopeOptions() {
    return [
      { value: 'INBOX', label: 'Inbox' },
      { value: 'CAMPAIGN', label: 'Campanha' },
      { value: 'BOTH', label: 'Ambos' },
    ];
  }

  private getTemplateCategoryOptions() {
    return [
      { value: 'GENERAL', label: 'Geral' },
      { value: 'QUALIFICATION', label: 'Qualificacao' },
      { value: 'FOLLOW_UP', label: 'Follow-up' },
      { value: 'REACTIVATION', label: 'Reativacao' },
      { value: 'SCHEDULING', label: 'Agendamento' },
      { value: 'SUPPORT', label: 'Suporte' },
      { value: 'CUSTOM', label: 'Customizado' },
    ];
  }

  private getCampaignStatusOptions() {
    return [
      { value: 'DRAFT', label: 'Rascunho' },
      { value: 'READY', label: 'Pronta' },
      { value: 'RUNNING', label: 'Em envio' },
      { value: 'COMPLETED', label: 'Concluida' },
      { value: 'PARTIAL', label: 'Concluida com ressalvas' },
      { value: 'CANCELED', label: 'Cancelada' },
    ];
  }

  private normalizeConversationStatus(value?: string | null, fallback = 'NEW') {
    const normalized = this.normalizeNullableString(value)?.toUpperCase();
    const allowed = new Set(this.getConversationStatusOptions().map((item) => item.value));
    if (normalized && allowed.has(normalized)) return normalized;
    return fallback;
  }

  private normalizeConsentStatus(value?: string | null, fallback = 'UNKNOWN') {
    const normalized = this.normalizeNullableString(value)?.toUpperCase();
    const allowed = new Set(this.getConsentStatusOptions().map((item) => item.value));
    if (normalized && allowed.has(normalized)) return normalized;
    return fallback;
  }

  private normalizeTemplateScope(value?: string | null) {
    const normalized = this.normalizeNullableString(value)?.toUpperCase();
    const allowed = new Set(this.getTemplateScopeOptions().map((item) => item.value));
    return normalized && allowed.has(normalized) ? normalized : 'BOTH';
  }

  private normalizeTemplateCategory(value?: string | null) {
    const normalized = this.normalizeNullableString(value)?.toUpperCase();
    const allowed = new Set(this.getTemplateCategoryOptions().map((item) => item.value));
    return normalized && allowed.has(normalized) ? normalized : 'GENERAL';
  }

  private normalizeAudienceMode(value?: string | null) {
    const normalized = this.normalizeNullableString(value)?.toUpperCase();
    return normalized || 'MANUAL';
  }

  private resolveConversationStatusAfterInbound(currentStatus?: string | null) {
    const normalized = this.normalizeConversationStatus(currentStatus);
    if (['WAITING_CUSTOMER', 'CLOSED', 'LOST', 'WON'].includes(normalized)) {
      return 'NEW';
    }
    return normalized;
  }

  private resolveConversationStatusAfterClaim(currentStatus?: string | null) {
    const normalized = this.normalizeConversationStatus(currentStatus);
    if (['NEW', 'QUALIFIED', 'LEAD_CAPTURED'].includes(normalized)) {
      return 'IN_PROGRESS';
    }
    return normalized;
  }

  private resolveConversationStatusAfterReply(currentStatus?: string | null) {
    const normalized = this.normalizeConversationStatus(currentStatus, 'IN_PROGRESS');
    if (['NEW', 'QUALIFIED', 'LEAD_CAPTURED', 'WAITING_CUSTOMER'].includes(normalized)) {
      return 'IN_PROGRESS';
    }
    return normalized;
  }

  private normalizeQuickReplyTemplates(input: unknown, fallback: QuickReplyTemplate[] = []): QuickReplyTemplate[] {
    const rows = Array.isArray(input) ? input : [];
    const normalized = rows
      .map((item) => {
        const payload = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
        const label = this.normalizeNullableString(payload.label);
        const text = this.normalizeNullableString(payload.text || payload.responseText);
        if (!label || !text) return null;
        return { label, text };
      })
      .filter((item): item is QuickReplyTemplate => !!item)
      .slice(0, 20);

    return normalized.length ? normalized : fallback;
  }

  private detectOptOutRequest(messageText: string | null | undefined, settings: SettingsJson) {
    const normalized = String(messageText || '')
      .trim()
      .toUpperCase();
    if (!normalized) return false;
    return settings.optOutKeywords.some((keyword) => normalized === keyword || normalized.includes(` ${keyword}`));
  }

  private resolveCampaignMessageText(
    informedText?: string | null,
    templateText?: string | null,
    fallbackText?: string | null,
  ) {
    const resolved =
      this.normalizeNullableString(informedText) ||
      this.normalizeNullableString(templateText) ||
      this.normalizeNullableString(fallbackText);
    if (!resolved) {
      throw new BadRequestException('Informe o texto da campanha ou selecione um template.');
    }
    return resolved;
  }

  private async replaceCampaignRecipients(
    tx: Prisma.TransactionClient,
    tenantId: string,
    campaignId: string,
    recipientsInput: Array<Record<string, unknown>> | undefined,
  ) {
    await tx.whatsapp_campaign_recipients.deleteMany({
      where: { tenant_id: tenantId, campaign_id: campaignId },
    });

    const normalizedRecipients = await this.normalizeCampaignRecipients(tx, tenantId, recipientsInput || []);
    if (!normalizedRecipients.length) return;

    await tx.whatsapp_campaign_recipients.createMany({
      data: normalizedRecipients.map((recipient) => ({
        id: randomUUID(),
        tenant_id: tenantId,
        campaign_id: campaignId,
        conversation_id: recipient.conversation_id,
        lead_id: recipient.lead_id,
        phone_number: recipient.phone_number,
        phone_number_normalized: recipient.phone_number_normalized,
        contact_name: recipient.contact_name,
        company_name: recipient.company_name,
        source_label: recipient.source_label,
        snapshot_opt_in_status: recipient.snapshot_opt_in_status,
        send_status: 'PENDING',
        created_at: new Date(),
        updated_at: new Date(),
      })),
    });
  }

  private async normalizeCampaignRecipients(
    tx: Prisma.TransactionClient,
    tenantId: string,
    recipientsInput: Array<Record<string, unknown>>,
  ) {
    const results: Array<Record<string, any>> = [];
    const seenPhones = new Set<string>();

    for (const rawRecipient of recipientsInput || []) {
      const payload = rawRecipient && typeof rawRecipient === 'object' ? rawRecipient : {};
      const conversationId = this.normalizeNullableString(payload.conversation_id);
      let conversation: any = null;
      if (conversationId) {
        conversation = await tx.whatsapp_conversations.findFirst({
          where: { tenant_id: tenantId, id: conversationId },
        });
      }

      const phone = this.normalizePhone(payload.phone_number || conversation?.contact_phone_normalized || conversation?.contact_phone);
      if (!phone || seenPhones.has(phone)) continue;
      seenPhones.add(phone);

      results.push({
        conversation_id: conversation?.id || null,
        lead_id: this.normalizeNullableString(payload.lead_id || conversation?.lead_id),
        phone_number: this.normalizeNullableString(payload.phone_number || conversation?.contact_phone) || phone,
        phone_number_normalized: phone,
        contact_name:
          this.normalizeNullableString(payload.contact_name || conversation?.contact_name) || `Contato ${phone}`,
        company_name: this.normalizeNullableString(payload.company_name),
        source_label: this.normalizeNullableString(payload.source_label || (conversation ? 'Inbox WhatsApp' : 'Manual')),
        snapshot_opt_in_status: this.normalizeConsentStatus(
          this.normalizeNullableString(payload.snapshot_opt_in_status),
          conversation?.marketing_opt_in_status || 'UNKNOWN',
        ),
      });
    }

    return results;
  }

  private async refreshCampaignMetrics(tx: Prisma.TransactionClient, tenantId: string, campaignId: string) {
    const recipients = await tx.whatsapp_campaign_recipients.findMany({
      where: { tenant_id: tenantId, campaign_id: campaignId },
      select: { send_status: true },
    });

    const metrics = {
      recipients_total: recipients.length,
      sent_total: recipients.filter((item) => item.send_status === 'SENT').length,
      failed_total: recipients.filter((item) => item.send_status === 'FAILED').length,
      skipped_total: recipients.filter((item) => item.send_status === 'SKIPPED').length,
    };

    await tx.whatsapp_campaigns.update({
      where: { id: campaignId },
      data: {
        ...metrics,
        status: metrics.recipients_total > 0 ? 'READY' : 'DRAFT',
        updated_at: new Date(),
      },
    });

    return metrics;
  }

  private buildCampaignMessageText(campaign: any, recipient: any, conversation: any, settings: SettingsJson) {
    const base = this.renderTemplate(campaign.message_text, this.buildCampaignVariables(campaign, recipient, conversation));
    const footer = this.normalizeNullableString(settings.campaignFooterText);
    return footer && !base.includes(footer) ? `${base}\n\n${footer}` : base;
  }

  private buildCampaignVariables(campaign: any, recipient: any, conversation: any) {
    const contactName =
      this.normalizeNullableString(conversation?.contact_name || recipient?.contact_name) || 'cliente';
    const firstName = contactName.split(/\s+/).filter(Boolean)[0] || contactName;
    return {
      campaign_name: campaign.name,
      contact_name: contactName,
      first_name: firstName,
      company_name: this.normalizeNullableString(recipient?.company_name) || '',
      phone: this.normalizeNullableString(recipient?.phone_number) || recipient?.phone_number_normalized || '',
      integration_name: this.normalizeNullableString(campaign?.integration?.name) || '',
    };
  }

  private getProviderDefaults() {
    const defaultProvider = this.normalizeProvider(
      this.configService.get<string>('WHATSAPP_SALES_DEFAULT_PROVIDER') ||
        (this.normalizeNullableString(this.configService.get<string>('WHATSAPP_ZAPI_INSTANCE_ID')) ? 'ZAPI' : 'IAZAP'),
    );

    if (defaultProvider === 'ZAPI') {
      return {
        provider: 'ZAPI',
        api_base_url:
          this.normalizeNullableString(this.configService.get<string>('WHATSAPP_ZAPI_BASE_URL')) || 'https://api.z-api.io',
        session_name: this.normalizeNullableString(this.configService.get<string>('WHATSAPP_ZAPI_INSTANCE_ID')) || '',
        api_key: this.normalizeNullableString(this.configService.get<string>('WHATSAPP_ZAPI_TOKEN')) || '',
        provider_client_token:
          this.normalizeNullableString(this.configService.get<string>('WHATSAPP_ZAPI_CLIENT_TOKEN')) || '',
      };
    }

    return {
      provider: 'IAZAP',
      api_base_url:
        this.normalizeNullableString(this.configService.get<string>('WHATSAPP_IAZAP_BASE_URL')) ||
        this.normalizeNullableString(this.configService.get<string>('WHATSAPP_PROVIDER_BASE_URL')) ||
        '',
      session_name:
        this.normalizeNullableString(this.configService.get<string>('WHATSAPP_IAZAP_SESSION_NAME')) ||
        this.normalizeNullableString(this.configService.get<string>('WHATSAPP_PROVIDER_SESSION_NAME')) ||
        '',
      api_key:
        this.normalizeNullableString(this.configService.get<string>('WHATSAPP_IAZAP_API_KEY')) ||
        this.normalizeNullableString(this.configService.get<string>('WHATSAPP_PROVIDER_API_KEY')) ||
        '',
      provider_client_token:
        this.normalizeNullableString(this.configService.get<string>('WHATSAPP_IAZAP_CLIENT_TOKEN')) ||
        this.normalizeNullableString(this.configService.get<string>('WHATSAPP_PROVIDER_CLIENT_TOKEN')) ||
        '',
    };
  }

  private getPartnerConfig() {
    const token =
      this.normalizeNullableString(this.configService.get<string>('WHATSAPP_ZAPI_PARTNER_TOKEN')) ||
      this.normalizeNullableString(this.configService.get<string>('WHATSAPP_ZAPI_INTEGRATOR_TOKEN'));

    return {
      enabled: Boolean(token),
      token,
      base_url:
        this.normalizeNullableString(this.configService.get<string>('WHATSAPP_ZAPI_BASE_URL')) || 'https://api.z-api.io',
      auto_subscribe:
        String(this.configService.get<string>('WHATSAPP_ZAPI_PARTNER_AUTO_SUBSCRIBE') || 'false').trim().toLowerCase() ===
        'true',
    };
  }

  private async requestPartnerApi(input: ProviderRequestInput): Promise<ProviderRequestResult> {
    const partner = this.getPartnerConfig();
    if (!partner.enabled || !partner.token) {
      throw new BadRequestException('Token parceiro da Z-API não configurado.');
    }

    const path = input.path.startsWith('/') ? input.path : `/${input.path}`;
    const response = await fetch(`${partner.base_url}${path}`, {
      method: input.method || 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${partner.token}`,
      },
      ...(input.method === 'GET' || input.method === 'DELETE' ? {} : { body: JSON.stringify(input.body || {}) }),
    });

    const data = await this.readJsonSafe(response);
    if (!response.ok) {
      const message =
        this.normalizeNullableString(data?.message) ||
        this.normalizeNullableString(data?.error) ||
        `Falha na API parceira do WhatsApp (${response.status}).`;
      throw new BadRequestException(message);
    }

    return {
      status: response.status,
      data,
    };
  }

  private detectStructuredMessageType(item: Record<string, unknown>): string | null {
    const mappings: Array<[string, string]> = [
      ['text', 'TEXT'],
      ['image', 'IMAGE'],
      ['video', 'VIDEO'],
      ['document', 'DOCUMENT'],
      ['audio', 'AUDIO'],
      ['sticker', 'STICKER'],
      ['location', 'LOCATION'],
      ['contact', 'CONTACT'],
      ['contacts', 'CONTACT'],
      ['poll', 'POLL'],
      ['reaction', 'REACTION'],
    ];

    for (const [key, value] of mappings) {
      if (this.pickObject(item[key])) return value;
    }

    return null;
  }

  private normalizeBaseUrl(value: string) {
    const normalized = this.normalizeNullableString(value);
    if (!normalized) throw new BadRequestException('api_base_url é obrigatório.');
    return normalized.replace(/\/$/, '');
  }

  private normalizePhone(value: unknown): string {
    const digits = String(value ?? '')
      .replace(/[^0-9]/g, '')
      .trim();
    return digits;
  }

  private normalizeNullableString(value: unknown): string | null {
    const text = String(value ?? '').trim();
    return text ? text : null;
  }

  private normalizeUuidArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => this.normalizeNullableString(item))
      .filter((item): item is string => !!item);
  }

  private normalizeKeywordList(value: unknown, fallback: string[] = []): string[] {
    const source = Array.isArray(value)
      ? value
      : String(value || '')
          .split(/[,\n]/)
          .map((item) => item.trim())
          .filter(Boolean);
    const rows = Array.from(
      new Set(
        source
          .map((item) => this.normalizeNullableString(item)?.toUpperCase())
          .filter((item): item is string => !!item),
      ),
    );
    return rows.length ? rows : [...fallback];
  }

  private normalizeTemplateVariables(value: unknown) {
    if (Array.isArray(value)) {
      return value
        .map((item) => this.normalizeNullableString(item))
        .filter((item): item is string => !!item)
        .slice(0, 20);
    }
    if (value && typeof value === 'object') return value;
    return [];
  }

  private normalizePlainObject(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  }

  private normalizeIntentArray(value: unknown, fallback: string[]): string[] {
    if (!Array.isArray(value)) return [...fallback];
    const items = Array.from(
      new Set(
        value
          .map((item) => this.normalizeIntent(item))
          .filter((item): item is string => !!item),
      ),
    );
    return items.length ? items : [...fallback];
  }

  private normalizeIntent(value: unknown): string | null {
    const raw = String(value ?? '')
      .trim()
      .toUpperCase();
    const allowed = ['BUDGET', 'QUOTE', 'PRICE', 'SUPPORT', 'FINANCE', 'GENERAL', 'SPAM'];
    return allowed.includes(raw) ? raw : null;
  }

  private normalizeKeywordReplyRules(value: unknown): KeywordReplyRule[] {
    if (!Array.isArray(value)) return [];

    return value
      .map((item) => this.pickObject(item))
      .filter((item): item is Record<string, unknown> => !!item)
      .map((item) => {
        const keywords = Array.isArray(item.keywords)
          ? item.keywords
              .map((entry) => this.normalizeNullableString(entry)?.toLowerCase())
              .filter((entry): entry is string => !!entry)
          : [];
        const uniqueKeywords = Array.from(new Set(keywords));
        const responseText = this.normalizeNullableString(item.responseText);
        if (!uniqueKeywords.length || !responseText) return null;
        return {
          keywords: uniqueKeywords,
          responseText,
        };
      })
      .filter((item): item is KeywordReplyRule => !!item);
  }

  private resolveKeywordReplyRule(bodyText: string | null | undefined, settings: SettingsJson): KeywordReplyRule | null {
    const haystack = String(bodyText || '')
      .trim()
      .toLowerCase();
    if (!haystack) return null;

    return (
      settings.keywordReplyRules.find((rule) =>
        rule.keywords.some((keyword) => keyword && haystack.includes(keyword)),
      ) || null
    );
  }

  private toBoolean(value: unknown, fallback: boolean) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true' || normalized === '1') return true;
      if (normalized === 'false' || normalized === '0') return false;
    }
    return fallback;
  }

  private toConfidence(value: unknown, fallback: number) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(0, Math.min(1, num));
  }

  private parseDate(...values: unknown[]): Date | null {
    for (const value of values) {
      if (value == null) continue;
      if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

      const numeric = Number(value);
      if (Number.isFinite(numeric) && numeric > 100000) {
        const asMs = numeric > 9999999999 ? numeric : numeric * 1000;
        const date = new Date(asMs);
        if (!Number.isNaN(date.getTime())) return date;
      }

      const date = new Date(String(value));
      if (!Number.isNaN(date.getTime())) return date;
    }
    return null;
  }

  private extractEmail(value: string): string | null {
    const match = String(value || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return match ? match[0] : null;
  }

  private renderTemplate(template: string, variables: Record<string, unknown>) {
    return String(template || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_all, key) => {
      const value = variables[key];
      return value == null ? '' : String(value);
    });
  }

  private parseJsonLoose(value: string): unknown {
    const normalized = String(value || '')
      .trim()
      .replace(/^```json/i, '')
      .replace(/^```/i, '')
      .replace(/```$/i, '')
      .trim();
    if (!normalized) return null;
    try {
      return JSON.parse(normalized);
    } catch {
      const firstBrace = normalized.indexOf('{');
      const lastBrace = normalized.lastIndexOf('}');
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        try {
          return JSON.parse(normalized.slice(firstBrace, lastBrace + 1));
        } catch {
          return null;
        }
      }
      return null;
    }
  }

  private generateToken(size = 16) {
    return randomBytes(size).toString('hex');
  }

  private slugify(value: string) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private maskSecret(value: string | null | undefined) {
    const source = this.normalizeNullableString(value);
    if (!source) return '';
    if (source.length <= 8) return `${source.slice(0, 2)}***`;
    return `${source.slice(0, 4)}***${source.slice(-3)}`;
  }

  private async storeWebhookDebug(integration: any, snapshot: Record<string, unknown>) {
    const currentPayload = this.pickObject(integration?.last_connection_payload) || {};
    const nextPayload = {
      ...currentPayload,
      webhook_debug: snapshot,
    };

    await this.prisma.whatsapp_integrations.update({
      where: { id: integration.id },
      data: {
        last_connection_payload: nextPayload as Prisma.InputJsonValue,
        updated_at: new Date(),
      },
    });
  }

  private extractErrorMessage(error: unknown) {
    const nestedMessage =
      this.normalizeNullableString((error as any)?.response?.message) ||
      this.normalizeNullableString((error as any)?.response?.data?.message) ||
      this.normalizeNullableString((error as any)?.response?.data?.error) ||
      this.normalizeNullableString((error as any)?.payload?.message) ||
      this.normalizeNullableString((error as any)?.payload?.error);
    return nestedMessage || this.normalizeNullableString((error as any)?.message) || 'Falha ao consultar a Z-API.';
  }

  private looksLikeQrImagePayload(value: string | null | undefined) {
    const raw = this.normalizeNullableString(value);
    if (!raw) return false;
    if (/^data:image\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/=\r\n]+$/i.test(raw)) return true;

    const compact = raw.replace(/\s+/g, '');
    if (compact.length < 100) return false;
    if (!/^[a-zA-Z0-9+/=]+$/.test(compact)) return false;

    return compact.startsWith('iVBOR') || compact.startsWith('/9j/') || compact.startsWith('R0lGOD');
  }

  private safeBuildWebhookPreview(integration: any) {
    try {
      return this.buildWebhookUrl(integration);
    } catch {
      return '';
    }
  }

  private pickObject(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private pickString(...values: unknown[]): string {
    for (const value of values) {
      if (value == null) continue;
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (typeof value === 'number' && Number.isFinite(value)) return String(value);
      if (typeof value === 'object') {
        const maybeId = this.pickObject(value);
        if (maybeId) {
          const nested = this.pickString(maybeId.id, maybeId.value, maybeId.phone);
          if (nested) return nested;
        }
      }
    }
    return '';
  }

  private pickBoolean(...values: unknown[]) {
    return values.some((value) => value === true || String(value).trim().toLowerCase() === 'true');
  }

  private extractProviderMessageId(providerPayload: any): string | null {
    return (
      this.normalizeNullableString(providerPayload?.messageId) ||
      this.normalizeNullableString(providerPayload?.id) ||
      this.normalizeNullableString(providerPayload?.data?.id)
    );
  }

  private async readJsonSafe(response: Response) {
    const text = await response.text().catch(() => '');
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return { message: text };
    }
  }
}
