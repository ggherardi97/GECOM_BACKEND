import { BadGatewayException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as https from 'https';
import { URL } from 'url';
import { ITtceProvider } from './ttce-provider.interface';
import { TtceAuthToken, TtceTaxRequest, TtceTaxResponse } from '../types/ttce.types';

type HttpResult = {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
};

@Injectable()
export class PortalUnicoTtceProvider implements ITtceProvider {
  private readonly logger = new Logger(PortalUnicoTtceProvider.name);

  private cachedToken: TtceAuthToken | null = null;

  constructor(private readonly configService: ConfigService) {}

  async authenticate(): Promise<TtceAuthToken> {
    if (this.cachedToken && this.cachedToken.expiresAt && this.cachedToken.expiresAt.getTime() > Date.now()) {
      return this.cachedToken;
    }

    const baseUrl = this.getBaseUrl();
    const roleType = this.getRequiredConfig('SISCOMEX_ROLE_TYPE');

    const response = await this.requestJson({
      method: 'POST',
      url: `${baseUrl}/portal/api/autenticar`,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Role-Type': roleType,
      },
      body: '{}',
      withClientCertificate: true,
    });

    if (response.statusCode < 200 || response.statusCode >= 300) {
      this.logger.error(`TTCE auth failed with status ${response.statusCode}`);
      throw new BadGatewayException('Falha ao autenticar no Siscomex TTCE.');
    }

    const jwt = this.getHeaderValue(response.headers, 'set-token');
    const csrf = this.getHeaderValue(response.headers, 'x-csrf-token');

    if (!jwt || !csrf) {
      this.logger.error('TTCE auth succeeded without required headers Set-Token/X-CSRF-Token');
      throw new InternalServerErrorException('Resposta de autenticação TTCE inválida.');
    }

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    this.cachedToken = { jwt, csrf, expiresAt };

    return this.cachedToken;
  }

  async getTaxes(request: TtceTaxRequest): Promise<TtceTaxResponse> {
    const execute = async (): Promise<TtceTaxResponse> => {
      const token = await this.authenticate();
      const baseUrl = this.getBaseUrl();
      const roleType = this.getRequiredConfig('SISCOMEX_ROLE_TYPE');

      const payload = {
        ncm: request.ncm,
        originCountry: request.originCountry,
        customsValue: request.customsValue,
        currency: request.currency,
        destinationState: request.destinationState,
      };

      // TODO: replace endpoint and payload fields with official TTCE schema when available.
      const response = await this.requestJson({
        method: 'POST',
        url: `${baseUrl}/portal/api/ext/ttce/taxes/simulate`,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Role-Type': roleType,
          Authorization: `Bearer ${token.jwt}`,
          'X-CSRF-Token': token.csrf,
        },
        body: JSON.stringify(payload),
        withClientCertificate: true,
      });

      if (response.statusCode === 401 || response.statusCode === 403) {
        throw new Error('TTCE_AUTH_EXPIRED');
      }

      if (response.statusCode < 200 || response.statusCode >= 300) {
        this.logger.error(`TTCE tax lookup failed with status ${response.statusCode}`);
        throw new BadGatewayException('Falha ao consultar tributos no Siscomex TTCE.');
      }

      const parsed = this.tryParseJson(response.body);
      const taxes = this.normalizeTaxes(parsed);

      return {
        taxes,
        raw: parsed,
      };
    };

    try {
      return await execute();
    } catch (error) {
      if ((error as Error).message === 'TTCE_AUTH_EXPIRED') {
        this.cachedToken = null;
        return execute();
      }

      if (error instanceof BadGatewayException || error instanceof InternalServerErrorException) {
        throw error;
      }

      this.logger.error(`TTCE unexpected error: ${(error as Error).message}`);
      throw new BadGatewayException('Falha ao consultar Siscomex TTCE.');
    }
  }

  private normalizeTaxes(payload: any): Array<{ taxType: string; rate?: string; baseAmountBrl?: string; amountBrl: string }> {
    const payloadTaxes = Array.isArray(payload?.taxes) ? payload.taxes : [];

    return payloadTaxes
      .map((tax: any) => {
        const taxType = String(tax?.taxType ?? tax?.type ?? 'OTHER').toUpperCase();
        const amountRaw = tax?.amountBrl ?? tax?.amount ?? 0;
        const baseRaw = tax?.baseAmountBrl ?? tax?.base ?? undefined;
        const rateRaw = tax?.rate ?? undefined;

        return {
          taxType,
          rate: rateRaw == null ? undefined : String(rateRaw),
          baseAmountBrl: baseRaw == null ? undefined : String(baseRaw),
          amountBrl: String(amountRaw),
        };
      })
      .filter((tax: { amountBrl: string }) => tax.amountBrl != null);
  }

  private getBaseUrl(): string {
    return (this.configService.get<string>('SISCOMEX_BASE_URL') ?? 'https://portalunico.siscomex.gov.br').replace(/\/+$/g, '');
  }

  private getRequiredConfig(key: string): string {
    const value = (this.configService.get<string>(key) ?? '').trim();
    if (!value) {
      throw new InternalServerErrorException(`Configuração ausente: ${key}`);
    }
    return value;
  }

  private getMutualTlsAgent(): https.Agent {
    const pfxBase64 = this.getRequiredConfig('SISCOMEX_PFX_BASE64');
    const passphrase = this.getRequiredConfig('SISCOMEX_PFX_PASSPHRASE');

    const pfx = Buffer.from(pfxBase64, 'base64');
    if (pfx.length === 0) {
      throw new InternalServerErrorException('Certificado SISCOMEX_PFX_BASE64 inválido.');
    }

    return new https.Agent({
      pfx,
      passphrase,
      keepAlive: true,
      rejectUnauthorized: true,
    });
  }

  private requestJson(input: {
    method: 'GET' | 'POST';
    url: string;
    headers?: Record<string, string>;
    body?: string;
    withClientCertificate: boolean;
  }): Promise<HttpResult> {
    return new Promise<HttpResult>((resolve, reject) => {
      const parsedUrl = new URL(input.url);
      const agent = input.withClientCertificate ? this.getMutualTlsAgent() : undefined;

      const req = https.request(
        {
          protocol: parsedUrl.protocol,
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || 443,
          path: `${parsedUrl.pathname}${parsedUrl.search}`,
          method: input.method,
          headers: input.headers,
          agent,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
          res.on('end', () => {
            resolve({
              statusCode: res.statusCode ?? 0,
              headers: res.headers,
              body: Buffer.concat(chunks).toString('utf8'),
            });
          });
        },
      );

      req.on('error', (error) => {
        this.logger.error(`HTTP request error: ${error.message}`);
        reject(error);
      });

      if (input.body) {
        req.write(input.body);
      }

      req.end();
    });
  }

  private getHeaderValue(headers: Record<string, string | string[] | undefined>, key: string): string | null {
    const headerValue = headers[key] ?? headers[key.toLowerCase()] ?? headers[key.toUpperCase()];
    if (Array.isArray(headerValue)) {
      return headerValue[0] ?? null;
    }
    return headerValue ?? null;
  }

  private tryParseJson(value: string): any {
    try {
      if (!value || !value.trim()) {
        return {};
      }
      return JSON.parse(value);
    } catch {
      return { raw: value };
    }
  }
}


