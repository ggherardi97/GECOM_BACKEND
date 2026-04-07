import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { AutomationAiEntityCatalog } from './automation-metadata.service';

export type AutomationAiResolvedReference = {
  key: string;
  entityName: string;
  query: string;
  id: string;
  label: string;
  subtitle?: string;
  notes?: string[];
};

export type AutomationAiAmbiguousReference = {
  key: string;
  entityName: string;
  query: string;
  matches: Array<{ id: string; label: string; subtitle?: string }>;
};

export type AutomationAiLiveContext = {
  resolved?: AutomationAiResolvedReference[];
  ambiguous?: AutomationAiAmbiguousReference[];
};

type AutomationAiConversationInput = {
  lang?: string;
  catalog: AutomationAiEntityCatalog[];
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  liveContext?: AutomationAiLiveContext;
};

type AutomationAiConversationResult =
  | {
      mode: 'needs_clarification';
      reply: string;
      missing?: string[];
      questions?: string[];
    }
  | {
      mode: 'needs_confirmation';
      reply: string;
      summary: string;
      automation: Record<string, unknown>;
    };

@Injectable()
export class AutomationAiService {
  private readonly logger = new Logger(AutomationAiService.name);
  private readonly client: OpenAI | null;
  private readonly enabled: boolean;
  private readonly model: string;

  constructor(private readonly configService: ConfigService) {
    const rawEnabled = String(this.configService.get<string>('ENABLE_AUTOMATION_AI') ?? 'true')
      .trim()
      .toLowerCase();

    this.enabled = rawEnabled !== 'false' && rawEnabled !== '0';
    this.model = this.configService.get<string>('OPENAI_MODEL_AUTOMATION') ?? 'gpt-5-mini';

    const apiKey = this.configService.get<string>('OPENAI_API_KEY')?.trim();
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
  }

  async runPrompt(input: {
    prompt: string;
    context: Record<string, unknown>;
    catalog?: AutomationAiEntityCatalog[];
    instructions?: string;
  }) {
    if (!this.enabled) {
      return {
        text: 'AI_ACTION desabilitada por feature flag.',
        provider: 'stub',
        stub: true,
      };
    }

    if (!this.client) {
      return {
        text: 'OPENAI_API_KEY nao configurada para AI_ACTION.',
        provider: 'stub',
        stub: true,
      };
    }

    try {
      const relevantCatalog = this.selectRelevantCatalog(
        [
          {
            role: 'user',
            content: `${input.prompt}\n${JSON.stringify(input.context || {})}`,
          },
        ],
        Array.isArray(input.catalog) ? input.catalog : [],
      );

      const response = await this.client.responses.create({
        model: this.model,
        input: [
          {
            role: 'system',
            content: this.buildActionExecutorPrompt({
              catalog: relevantCatalog,
              instructions: input.instructions,
            }),
          },
          {
            role: 'user',
            content: `PROMPT:\n${input.prompt}\n\nCONTEXTO_JSON:\n${JSON.stringify(input.context)}`,
          },
        ],
      } as any);

      const text = this.extractText(response);
      return {
        text,
        provider: 'openai',
        model: this.model,
        stub: false,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      this.logger.warn(`Falha no AI_ACTION: ${message}`);
      return {
        text: `Falha no AI_ACTION: ${message}`,
        provider: 'stub',
        stub: true,
      };
    }
  }

  async planAutomationConversation(
    input: AutomationAiConversationInput,
  ): Promise<AutomationAiConversationResult> {
    if (!this.enabled) {
      return {
        mode: 'needs_clarification',
        reply: 'A criacao por IA esta desabilitada no momento. Voce pode usar a criacao manual abaixo.',
        missing: [],
        questions: [],
      };
    }

    if (!this.client) {
      return {
        mode: 'needs_clarification',
        reply: 'A chave da OpenAI nao esta configurada. Voce pode usar a criacao manual abaixo.',
        missing: [],
        questions: [],
      };
    }

    try {
      const relevantCatalog = this.selectRelevantCatalog(input.messages, input.catalog);
      const response = await this.client.responses.create({
        model: this.model,
        input: [
          {
            role: 'system',
              content: this.buildAutomationPlannerPrompt({
                lang: input.lang,
                catalog: relevantCatalog,
                liveContext: input.liveContext,
              }),
          },
          ...input.messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        ],
      } as any);

      const text = this.extractText(response);
      const parsed = this.extractJson(text);

      if (parsed?.mode === 'needs_confirmation' && parsed.automation && typeof parsed.automation === 'object') {
        return {
          mode: 'needs_confirmation',
          reply: String(parsed.reply || 'Entendi a automacao e montei um rascunho para sua confirmacao.').trim(),
          summary: String(parsed.summary || 'Confirme se o rascunho esta correto.').trim(),
          automation: parsed.automation as Record<string, unknown>,
        };
      }

      return {
        mode: 'needs_clarification',
        reply: String(parsed?.reply || 'Preciso de mais detalhes para montar a automacao.').trim(),
        missing: Array.isArray(parsed?.missing)
          ? parsed.missing.map((item) => String(item || '').trim()).filter(Boolean)
          : [],
        questions: Array.isArray(parsed?.questions)
          ? parsed.questions.map((item) => String(item || '').trim()).filter(Boolean)
          : [],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      this.logger.warn(`Falha ao planejar automacao com IA: ${message}`);
      return {
        mode: 'needs_clarification',
        reply: `Nao consegui montar a automacao agora: ${message}`,
        missing: [],
        questions: [],
      };
    }
  }

  private extractText(response: any): string {
    if (typeof response?.output_text === 'string' && response.output_text.trim()) {
      return response.output_text.trim();
    }

    const outputs = Array.isArray(response?.output) ? response.output : [];
    const chunks: string[] = [];

    outputs.forEach((out: any) => {
      const content = Array.isArray(out?.content) ? out.content : [];
      content.forEach((item: any) => {
        if (typeof item?.text === 'string') {
          chunks.push(item.text);
        }
      });
    });

    return chunks.join('\n').trim() || 'Sem resposta da IA.';
  }

  private buildAutomationPlannerPrompt(input: {
    lang?: string;
    catalog: AutomationAiEntityCatalog[];
    liveContext?: AutomationAiLiveContext;
  }): string {
    const language = this.resolveLanguageLabel(input.lang);
    const catalogText = input.catalog.map((entity) => this.formatCatalogEntity(entity)).join('\n\n');
    const liveContextText = this.formatLiveContext(input.liveContext);

    return [
      `Voce e um arquiteto senior de automacoes do ERP. Responda em ${language}.`,
      'Voce entende linguagem natural simples do usuario e converte isso em automacoes tecnicas validas.',
      'Voce deve mapear nomes de negocio para tabelas e campos tecnicos usando o catalogo do ERP.',
      'Voce pode receber referencias ja resolvidas do tenant com IDs reais de board, coluna, empresa e outros registros. Use essas referencias diretamente quando existirem.',
      'Quando o usuario informar o nome de um registro de negocio, assuma por padrao que ele quer usar um registro existente do tenant. Nao pergunte se deve criar um novo a menos que o usuario tenha pedido isso explicitamente.',
      'Voce deve evitar perguntas tecnicas desnecessarias. So pergunte quando houver ambiguidade real ou faltar dado obrigatorio.',
      'Quando ja houver contexto suficiente, responda com um rascunho para confirmacao humana.',
      'Voce DEVE responder somente JSON puro, sem markdown, sem explicacoes fora do JSON.',
      'Use exatamente um dos formatos abaixo:',
      '{"mode":"needs_clarification","reply":"texto curto","missing":["entity_name"],"questions":["Qual tabela deve disparar a automacao?"]}',
      '{"mode":"needs_confirmation","reply":"texto curto","summary":"resumo amigavel","automation":{"name":"...","description":"...","entity_name":"invoices","trigger_type":"ENTITY_EVENT","trigger_config":{"entityName":"invoices","eventType":"UPDATE","fieldChanged":"status_config_id","condition":{"source":"after","field":"status_config.label","operator":"EQUALS","value":"Pago"}},"workflow_json":{"version":1,"trigger":{"type":"ENTITY_EVENT","config":{"entityName":"invoices","eventType":"UPDATE","fieldChanged":"status_config_id","condition":{"source":"after","field":"status_config.label","operator":"EQUALS","value":"Pago"}}},"actions":[{"id":"action_1","type":"CREATE_REGISTER","config":{"entityName":"financial_receivables","fieldMappings":[{"field":"title_number","value":"{{payload.after.invoice_number}}-01"},{"field":"company_id","value":"{{payload.after.company_id}}"},{"field":"invoice_id","value":"{{payload.after.id}}"},{"field":"currency_id","value":"{{payload.after.currency_id}}"},{"field":"issue_date","value":"{{payload.after.updated_at}}"},{"field":"due_date","value":"{{payload.after.updated_at}}"},{"field":"original_amount","value":"{{payload.after.received_amount_brl}}"}]}}],"ui":{"nodes":[{"id":"trigger","x":120,"y":80},{"id":"action_1","x":380,"y":80}]}}}}',
      'Regras obrigatorias:',
      '- Se faltar tabela, trigger, cron quando for agendada, ou acao, use mode="needs_clarification".',
      '- Se ja houver contexto suficiente, use mode="needs_confirmation".',
      '- trigger_type permitido: MANUAL, ENTITY_EVENT, SCHEDULE.',
      '- Em ENTITY_EVENT, use trigger_config.entityName e trigger_config.eventType com CREATE ou UPDATE.',
      '- Use fieldChanged quando a automacao depende de um campo alterado.',
      '- O motor suporta trigger_config.condition com formato { source, field, operator, value }.',
      '- O motor tambem suporta trigger_config.conditions com uma lista de condicoes. Quando precisar combinar board + coluna origem + coluna destino, prefira conditions.',
      '- source permitido: after ou before. Prefira after.',
      '- operator permitido: EQUALS, NOT_EQUALS, CONTAINS, GREATER_THAN, LESS_THAN, GREATER_OR_EQUAL, LESS_OR_EQUAL, CHANGED_TO, CHANGED_FROM, IS_TRUE, IS_FALSE, NOT_EMPTY, IS_EMPTY.',
      '- Para frases como "quando status virar Pago", prefira CHANGED_TO ou EQUALS no campo certo.',
        '- Se a entidade tiver status configuravel, prefira usar status_config.label ou status_config.code quando isso fizer mais sentido do que o legacy status.',
        '- Ao criar contas a receber a partir de invoices, prefira received_amount_brl e BRL quando a invoice tiver valor convertido em real; se nao houver esse campo preenchido, use total e currency_id originais.',
        '- Se houver referencias resolvidas abaixo, NAO pergunte IDs ao usuario. Use os IDs resolvidos.',
      '- Se houver referencias ambiguas abaixo, faca a pergunta em linguagem humana, mostrando os nomes encontrados. Nunca peca "ID".',
      '- Nunca peca UUID, ID tecnico, company_id, board_id ou column_id se voce puder pedir o nome humano do registro.',
      '- Se o usuario fornecer um nome exato de empresa, board ou coluna, tente usar esse nome diretamente. Nao peca confirmacoes redundantes como "posso buscar?" ou "ele existe mesmo?" sem necessidade.',
      '- A automacao pronta precisa ter pelo menos uma action.',
      '- Actions permitidas: UPDATE_FIELD, SEND_EMAIL, CREATE_TASK, WEBHOOK, AI_ACTION, CREATE_REGISTER, WHATSAPP.',
      '- UPDATE_FIELD config: { entityName, recordId, recordLabel, field, value }.',
      '- SEND_EMAIL config: { to, cc, bcc, subject, body }.',
      '- CREATE_TASK config: { title, description }.',
      '- WEBHOOK config: { url, method, headers, body }.',
      '- AI_ACTION config: { prompt, outputKey }.',
      '- CREATE_REGISTER config: { entityName, fieldMappings:[{ field, value }] }.',
      '- WHATSAPP config: { integrationId, to, message }.',
      '- Use templates com payload.after, payload.before, payload, recordId e output quando necessario. Exemplo: {{payload.after.company_id}}.',
      '- Exemplo de movimento em board: trigger_config.conditions pode ter [{source:"after",field:"board_id",operator:"EQUALS",value:"uuid-board"},{source:"before",field:"column_id",operator:"EQUALS",value:"uuid-coluna-origem"},{source:"after",field:"column_id",operator:"EQUALS",value:"uuid-coluna-destino"}].',
      '- Quando o usuario falar termos de negocio como contas a receber, faturas, cliente ou responsavel, mapeie isso para a tabela/campo tecnico mais compativel do catalogo.',
      '- O resumo deve ser amigavel, sem nomes muito tecnicos quando nao forem necessarios.',
      liveContextText ? `Contexto vivo do tenant:\n${liveContextText}` : '',
      'Catalogo relevante do ERP:',
      catalogText || 'Sem catalogo disponivel.',
    ].join('\n');
  }

  private buildActionExecutorPrompt(input: {
    catalog: AutomationAiEntityCatalog[];
    instructions?: string;
  }): string {
    const catalogText = input.catalog.map((entity) => this.formatCatalogEntity(entity)).join('\n\n');

    return [
      'Voce executa acoes automaticas do ERP e responde em portugues com texto curto e objetivo.',
      'Voce deve usar o contexto do registro, o catalogo de entidades e os campos do ERP para evitar respostas genericas.',
      'Quando o pedido mencionar tabelas, statuses, invoices, clientes, leads, contratos, financeiro ou campos relacionados, use o catalogo abaixo.',
      'Se o prompt pedir filtros, listas, vencimentos ou relacoes entre tabelas, considere os nomes tecnicos e aliases do catalogo.',
      input.instructions ? `Instrucoes extras:\n${input.instructions}` : '',
      'Catalogo relevante do ERP:',
      catalogText || 'Sem catalogo disponivel.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private selectRelevantCatalog(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    catalog: AutomationAiEntityCatalog[],
  ): AutomationAiEntityCatalog[] {
    if (!catalog.length) return [];

    const conversation = this.normalizeSearchText(messages.map((message) => message.content).join(' '));
    const scored = catalog
      .map((entity) => ({
        entity,
        score: this.scoreEntityMatch(conversation, entity),
      }))
      .sort((left, right) => right.score - left.score);

    const top = scored.filter((row) => row.score > 0).slice(0, 10).map((row) => row.entity);
    const selected = top.length ? top : scored.slice(0, 10).map((row) => row.entity);
    const expanded = new Map<string, AutomationAiEntityCatalog>(selected.map((entity) => [entity.name, entity]));

    selected.forEach((entity) => {
      entity.fields.forEach((field) => {
        if (field.relationEntity) {
          const relation = catalog.find((item) => item.name === field.relationEntity);
          if (relation && expanded.size < 14) {
            expanded.set(relation.name, relation);
          }
        }
      });
    });

    return Array.from(expanded.values()).slice(0, 14);
  }

  private scoreEntityMatch(searchText: string, entity: AutomationAiEntityCatalog): number {
    let score = 0;

    entity.aliases.forEach((alias) => {
      const normalizedAlias = this.normalizeSearchText(alias);
      if (!normalizedAlias) return;
      if (searchText.includes(normalizedAlias)) {
        score += normalizedAlias.includes(' ') ? 18 : 12;
      }
    });

    entity.fields.forEach((field) => {
      field.aliases.slice(0, 8).forEach((alias) => {
        const normalizedAlias = this.normalizeSearchText(alias);
        if (!normalizedAlias) return;
        if (searchText.includes(normalizedAlias)) {
          score += field.required ? 5 : 3;
        }
      });

      (field.options || []).slice(0, 10).forEach((option) => {
        const normalizedLabel = this.normalizeSearchText(option.label);
        const normalizedValue = this.normalizeSearchText(option.value);
        if (normalizedLabel && searchText.includes(normalizedLabel)) score += 6;
        if (normalizedValue && searchText.includes(normalizedValue)) score += 5;
      });
    });

    return score;
  }

  private formatCatalogEntity(entity: AutomationAiEntityCatalog): string {
    const aliases = entity.aliases.slice(0, 8).join(', ');
    const fields = entity.fields
      .map((field) => {
        const parts = [
          `${field.name} [${field.label}]`,
          field.dataType,
          field.required ? 'required' : field.writable ? 'optional' : 'readonly',
        ];

        if (field.relationEntity) {
          parts.push(`lookup:${field.relationEntity}`);
        }

        if (field.options?.length) {
          const options = field.options
            .slice(0, 8)
            .map((option) => `${option.label}${option.value && option.value !== option.label ? `=${option.value}` : ''}`)
            .join(', ');
          parts.push(`options:${options}`);
        }

        return `- ${parts.join(' | ')}`;
      })
      .join('\n');

    return [
      `ENTITY ${entity.name} | ${entity.label}${entity.route ? ` | route:${entity.route}` : ''}`,
      `ALIASES: ${aliases}`,
      'FIELDS:',
      fields || '- none',
    ].join('\n');
  }

  private formatLiveContext(liveContext?: AutomationAiLiveContext): string {
    if (!liveContext) return '';

    const lines: string[] = [];
    const resolved = Array.isArray(liveContext.resolved) ? liveContext.resolved : [];
    const ambiguous = Array.isArray(liveContext.ambiguous) ? liveContext.ambiguous : [];

    if (resolved.length) {
      lines.push('REFERENCIAS RESOLVIDAS:');
      resolved.forEach((item) => {
        const noteText = Array.isArray(item.notes) && item.notes.length ? ` | notas: ${item.notes.join(', ')}` : '';
        lines.push(
          `- ${item.key}: ${item.entityName} | query="${item.query}" | id=${item.id} | label=${item.label}${
            item.subtitle ? ` | subtitle=${item.subtitle}` : ''
          }${noteText}`,
        );
      });
    }

    if (ambiguous.length) {
      lines.push('REFERENCIAS AMBIGUAS:');
      ambiguous.forEach((item) => {
        const options = item.matches
          .slice(0, 5)
          .map((match) => `${match.label}${match.subtitle ? ` (${match.subtitle})` : ''}`)
          .join(' ; ');
        lines.push(`- ${item.key}: ${item.entityName} | query="${item.query}" | opcoes: ${options}`);
      });
    }

    return lines.join('\n');
  }

  private resolveLanguageLabel(lang?: string): string {
    const normalized = String(lang || '')
      .trim()
      .toLowerCase();
    if (normalized.startsWith('en')) return 'ingles';
    if (normalized.startsWith('es')) return 'espanhol';
    return 'portugues do Brasil';
  }

  private normalizeSearchText(value: string): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .trim()
      .toLowerCase();
  }

  private extractJson(text: string): Record<string, unknown> | null {
    const cleaned = String(text || '').trim();
    if (!cleaned) return null;

    const candidates = [cleaned];
    const fenced = cleaned.replace(/^```(?:json)?\s*|\s*```$/gi, '').trim();
    if (fenced && fenced !== cleaned) {
      candidates.push(fenced);
    }

    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      candidates.push(cleaned.slice(firstBrace, lastBrace + 1));
    }

    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        // ignore invalid candidate
      }
    }

    return null;
  }
}
