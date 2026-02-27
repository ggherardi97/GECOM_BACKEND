import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

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

  async runPrompt(input: { prompt: string; context: Record<string, unknown> }) {
    if (!this.enabled) {
      return {
        text: 'AI_ACTION desabilitada por feature flag.',
        provider: 'stub',
        stub: true,
      };
    }

    if (!this.client) {
      return {
        text: 'OPENAI_API_KEY não configurada para AI_ACTION.',
        provider: 'stub',
        stub: true,
      };
    }

    try {
      const response = await this.client.responses.create({
        model: this.model,
        input: [
          {
            role: 'system',
            content:
              'Você executa ações automáticas do ERP. Responda em português com texto curto e objetivo para uso em automações.',
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
}

