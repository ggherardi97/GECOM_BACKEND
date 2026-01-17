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

  const payload = { sub: user.id, email: user.email, role: user.role };

  const access_token = this.jwtService.sign(payload, {
    secret: process.env.JWT_SECRET,
    expiresIn: '15m',
  });

  const refresh_token = this.jwtService.sign(payload, {
    secret: process.env.JWT_REFRESH_SECRET,
    expiresIn: '7d',
  });

  const refresh_token_hash = await this.cryptoService.hash(refresh_token);
  await this.createOrUpdateSession(user.id, refresh_token_hash, req);

  return {
    access_token,
    refresh_token,
  };
}


  async refreshToken(refresh_token: string, req: Request) {
    try {
      const { sub } = await this.jwtService.verify(refresh_token, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
      const [user] = await Promise.all([this.userService.findById(sub as string)]);

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      const session = user.sessions;

      if (!session) throw new UnauthorizedException('Session not found');

      const isValid = await this.cryptoService.verify(refresh_token, session.refresh_token);

      if (!isValid) throw new UnauthorizedException('Invalid refresh token');

      const payload_for_new_tokens = { sub: user.id, email: user.email, role: user.role };

      const new_access_token = this.jwtService.sign(payload_for_new_tokens, {
        secret: process.env.JWT_SECRET,
        expiresIn: '15m',
      });

      const new_refresh_token = this.jwtService.sign(payload_for_new_tokens, {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: '7d',
      });

      const refresh_token_hash = await this.cryptoService.hash(new_refresh_token);

      await this.createOrUpdateSession(user.id, refresh_token_hash, req);

      return {
        access_token: new_access_token,
        refresh_token: new_refresh_token,
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async createOrUpdateSession(user_id: string, refresh_token: string, req: Request) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress;

    const parser = new UAParser(req.headers['user-agent'] || '');
    const os = parser.getOS()?.name || 'Unknown OS';
    const browser = parser.getBrowser()?.name || 'Unknown Browser';

    const device_info = `${os} - ${browser}`;
    await this.userService.createOrUpdateSession({
      user_id: user_id,
      refresh_token: refresh_token,
      ip_address: ip || 'Unknown IP',
      device_info: device_info,
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
      console.log(user);
      const resetToken = generateToken(32);
      const tokenHash = await this.cryptoService.hash(resetToken);

      await this.passwordResetService.generateResetToken({
        token: tokenHash,
        user_id: user.id,
      });

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
    // Validar se as senhas coincidem
    if (new_password !== confirm_password) {
      throw new BadRequestException('As senhas não coincidem');
    }

    // Buscar usuário
    const user = await this.userService.findById(user_id);
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    // Buscar token de reset
    const reset_record = await this.passwordResetService.getToken(user_id);
    if (!reset_record) {
      throw new BadRequestException('Token de reset inválido ou expirado');
    }

    // Verificar se token é válido
    const isValidToken = await this.cryptoService.verify(token, reset_record.token);
    if (!isValidToken) {
      throw new BadRequestException('Token de reset inválido');
    }

    // Verificar se token não expirou (1 hora)
    if (reset_record.expires_at < new Date()) {
      await this.passwordResetService.deleteToken(user_id);
      throw new BadRequestException('Token de reset expirado. Solicite um novo reset de senha.');
    }

    // Atualizar senha do usuário
    const hashedPassword = await this.cryptoService.hash(new_password);
    await this.userService.updatePassword(user_id, hashedPassword);

    // Remover token usado
    await this.passwordResetService.deleteToken(user_id);
    // Invalidar todas as sessões do usuário por segurança
    if (user.sessions) {
      await this.userService.logoutAll(user.sessions.refresh_token);
    }

    return {
      message: 'Senha redefinida com sucesso. Faça login com sua nova senha.',
    };
  }
}
