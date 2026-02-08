import { Injectable, UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';
import { UserService } from '../users/user.service';
import { JwtService } from '@nestjs/jwt';
import { CryptoService } from '../crypto/crypto.service';
import { PasswordResetService } from '../password-reset/password-reset.service';
import { MailerService } from '../mailer/mailer.service';
import type { Request } from 'express';
import { UAParser } from 'ua-parser-js';
import { addDays } from 'date-fns';
import { generateToken } from '../utils/generate-token';
import { readFileSync } from 'fs';
import { join } from 'path';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private userService: UserService,
    private readonly cryptoService: CryptoService,
    private readonly passwordResetService: PasswordResetService,
    private readonly mailerService: MailerService
  ) {}

  async login(email: string, password: string, req: Request) {
    const user = await this.userService.validateUser(email, password);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const payload = { sub: user.id, email: user.email, role: user.role, tenant_id: user.tenant_id };

    const access_token = this.jwtService.sign(payload, {
      secret: process.env.JWT_SECRET,
      expiresIn: '15m',
    });

    const refresh_token = this.jwtService.sign(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: '7d',
    });

    const refresh_token_hash = await this.cryptoService.hash(refresh_token);

    const tenantId = user.tenant_id;
if (!tenantId) {
  throw new BadRequestException('User is missing tenant_id. Please contact support.');
}

await this.createOrUpdateSession(tenantId, user.id, refresh_token_hash, req);

    return {
      access_token,
      refresh_token,
    };
  }

  async refreshToken(refresh_token: string, req: Request) {
    try {
      const decoded = await this.jwtService.verify(refresh_token, {
        secret: process.env.JWT_REFRESH_SECRET,
      });

      const sub = decoded?.sub as string | undefined;
      if (!sub) throw new UnauthorizedException('Invalid refresh token');

      const user = await this.userService.findById(sub);
      if (!user) throw new UnauthorizedException('User not found');

      const session = user.sessions;
      if (!session) throw new UnauthorizedException('Session not found');

      const isValid = await this.cryptoService.verify(refresh_token, session.refresh_token);
      if (!isValid) throw new UnauthorizedException('Invalid refresh token');

      const payload_for_new_tokens = {
        sub: user.id,
        email: user.email,
        role: user.role,
        tenant_id: user.tenant_id,
      };

      const new_access_token = this.jwtService.sign(payload_for_new_tokens, {
        secret: process.env.JWT_SECRET,
        expiresIn: '15m',
      });

      const new_refresh_token = this.jwtService.sign(payload_for_new_tokens, {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: '7d',
      });

      const refresh_token_hash = await this.cryptoService.hash(new_refresh_token);

      await this.createOrUpdateSession(user.tenant_id, user.id, refresh_token_hash, req);

      return {
        access_token: new_access_token,
        refresh_token: new_refresh_token,
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async createOrUpdateSession(tenant_id: string, user_id: string, refresh_token: string, req: Request) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress;

    const parser = new UAParser(req.headers['user-agent'] || '');
    const os = parser.getOS()?.name || 'Unknown OS';
    const browser = parser.getBrowser()?.name || 'Unknown Browser';

    const device_info = `${os} - ${browser}`;

    await this.userService.createOrUpdateSession({
      tenant_id,
      user_id,
      refresh_token,
      ip_address: ip || 'Unknown IP',
      device_info,
      expires_at: addDays(new Date(), 7),
    });
  }

  async logout(refresh_token: string) {
    await this.userService.logoutAll(refresh_token);
    return { message: 'All sessions terminated' };
  }

  async forgotPassword(email: string) {
    try {
      const user = await this.userService.findByEmail(email);

      // Always return the same message (avoid user enumeration)
      if (!user) {
        return {
          message: 'Se o email existir em nossa base, você receberá as instruções para redefinir sua senha.',
        };
      }

      const resetToken = generateToken(32);
      const tokenHash = await this.cryptoService.hash(resetToken);

      await this.passwordResetService.generateResetToken({
        tenant_id: user.tenant_id,
        token: tokenHash,
        user_id: user.id,
      } as any);

      const template = readFileSync(
        join(__dirname, '..', 'mailer', 'templates', 'forgot-password.html'),
        'utf8'
      );

      const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}&userId=${user.id}`;
      const currentYear = new Date().getFullYear();

      const html = template
        .replace(/{{name}}/g, user.full_name)
        .replace(/{{resetLink}}/g, resetLink)
        .replace(/{{year}}/g, currentYear.toString());

      await this.mailerService.sendWelcomeEmail(
        user.email,
        'Redefinição de Senha - GECOM',
        html
      );

      return {
        message: 'Se o email existir em nossa base, você receberá as instruções para redefinir sua senha.',
      };
    } catch (error) {
      return {
        message: 'Se o email existir em nossa base, você receberá as instruções para redefinir sua senha.',
      };
    }
  }

  async resetPassword(user_id: string, token: string, new_password: string, confirm_password: string) {
    if (new_password !== confirm_password) {
      throw new BadRequestException('As senhas não coincidem');
    }

    const user = await this.userService.findById(user_id);
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const reset_record = await this.passwordResetService.getToken(user_id);
    if (!reset_record) {
      throw new BadRequestException('Token de reset inválido ou expirado');
    }

    const isValidToken = await this.cryptoService.verify(token, reset_record.token);
    if (!isValidToken) {
      throw new BadRequestException('Token de reset inválido');
    }

    if (reset_record.expires_at < new Date()) {
      await this.passwordResetService.deleteToken(user_id);
      throw new BadRequestException('Token de reset expirado. Solicite um novo reset de senha.');
    }

    const hashedPassword = await this.cryptoService.hash(new_password);
    await this.userService.updatePassword(user_id, hashedPassword);

    await this.passwordResetService.deleteToken(user_id);

    if (user.sessions) {
      await this.userService.logoutAll(user.sessions.refresh_token);
    }

    return {
      message: 'Senha redefinida com sucesso. Faça login com sua nova senha.',
    };
  }
}
