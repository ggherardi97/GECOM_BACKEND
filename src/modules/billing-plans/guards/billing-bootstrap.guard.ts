import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(String(a ?? ''), 'utf8');
  const bBuf = Buffer.from(String(b ?? ''), 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

@Injectable()
export class BillingBootstrapGuard implements CanActivate {
  private readonly expectedUser =
    process.env.BILLING_BOOTSTRAP_USER || 'portaladmin';
  private readonly expectedPassword =
    process.env.BILLING_BOOTSTRAP_PASSWORD || 'Q!w2E#r4T%';

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();

    const authorization = String(req?.headers?.authorization || '');
    if (!authorization.startsWith('Basic ')) {
      this.challenge(res);
      throw new UnauthorizedException('Credenciais de bootstrap ausentes.');
    }

    const encoded = authorization.slice('Basic '.length).trim();
    let decoded = '';
    try {
      decoded = Buffer.from(encoded, 'base64').toString('utf8');
    } catch {
      this.challenge(res);
      throw new UnauthorizedException('Credenciais de bootstrap invalidas.');
    }

    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex < 0) {
      this.challenge(res);
      throw new UnauthorizedException('Credenciais de bootstrap invalidas.');
    }

    const username = decoded.slice(0, separatorIndex);
    const password = decoded.slice(separatorIndex + 1);

    if (!safeEqual(username, this.expectedUser) || !safeEqual(password, this.expectedPassword)) {
      this.challenge(res);
      throw new UnauthorizedException('Usuario ou senha de bootstrap invalidos.');
    }

    return true;
  }

  private challenge(res: any) {
    res?.setHeader?.(
      'WWW-Authenticate',
      'Basic realm="GECOM Billing Bootstrap", charset="UTF-8"',
    );
  }
}
