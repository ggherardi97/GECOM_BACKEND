import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UserService } from '../users/user.service';
import { JwtService } from '@nestjs/jwt';
import { CryptoService } from '../crypto/crypto.service';
import type { Request } from 'express';
import { UAParser } from 'ua-parser-js';
import { addDays } from 'date-fns';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private userService: UserService,
    private readonly cryptoService: CryptoService
  ) {}

  async login(email: string, password: string, req: Request) {
    const user = await this.userService.validateUser(email, password);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const payload = { sub: user.id, email: user.email };

    const access_token = this.jwtService.sign(payload, {
      expiresIn: '15m',
    });

    const refresh_token = this.jwtService.sign(payload, {
      expiresIn: '7d',
    });

    const refresh_token_hash = await this.cryptoService.hash(refresh_token);

    await this.createOrUpdateSession(user.id, refresh_token_hash, req);

    return {
      access_token: access_token,
      refresh_token: refresh_token,
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

      const payload_for_new_tokens = { sub: user.id, email: user.email };

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
}
