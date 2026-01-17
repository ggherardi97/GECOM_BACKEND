import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../../prisma/prisma.service';
import { CryptoService } from '../../crypto/crypto.service';

@Injectable()
export class RefreshSessionGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly cryptoService: CryptoService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();

    const refreshToken: string | undefined =
      req.cookies?.refresh_token ||
      req.cookies?.refreshToken ||
      req.cookies?.refresh ||
      req.cookies?.token;

    if (!refreshToken || typeof refreshToken !== 'string' || refreshToken.trim().length === 0) {
      throw new UnauthorizedException('Missing refresh token cookie');
    }

    // IMPORTANT:
    // - refresh token should be signed with JWT_REFRESH_SECRET (after we fix AuthService.login)
    // - during transition, we also accept JWT_SECRET (old tokens)
    let userIdFromToken: string | null = null;

    try {
      const payload: any = this.jwtService.verify(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
      userIdFromToken = payload?.sub ?? payload?.userId ?? payload?.id ?? null;
    } catch {
      // fallback for old tokens that were signed with JWT_SECRET
      try {
        const payload: any = this.jwtService.verify(refreshToken, {
          secret: process.env.JWT_SECRET,
        });
        userIdFromToken = payload?.sub ?? payload?.userId ?? payload?.id ?? null;
      } catch {
        userIdFromToken = null;
      }
    }

    if (!userIdFromToken) {
      throw new UnauthorizedException('Invalid session');
    }

    // Your code stores session by user_id and stores refresh_token as HASH.
    const session = await this.prisma.sessions.findFirst({
      where: { user_id: userIdFromToken },
      select: { user_id: true, refresh_token: true, expires_at: true },
    });

    if (!session) {
      throw new UnauthorizedException('Invalid session');
    }

    if (session.expires_at && new Date(session.expires_at) <= new Date()) {
      throw new UnauthorizedException('Session expired');
    }

    const storedHash = session.refresh_token ?? '';
    const isValid = await this.cryptoService.verify(refreshToken, storedHash);

    if (!isValid) {
      throw new UnauthorizedException('Invalid session');
    }

    req.user = { userId: session.user_id };
    return true;
  }
}
