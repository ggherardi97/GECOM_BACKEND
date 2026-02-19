import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
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
import { randomUUID } from 'crypto';
import { Prisma, user_role_enum, user_status_enum, view_visibility_enum, view_source_enum } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { runWithTenant } from '../../common/tenant/tenant-context';
import { SignUpDTO, SignUpResponseDTO } from './dtos/signup.dto';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private userService: UserService,
    private readonly cryptoService: CryptoService,
    private readonly passwordResetService: PasswordResetService,
    private readonly mailerService: MailerService,
    private readonly prisma: PrismaService
  ) {}

  private normalizeSlug(value: string): string {
    return String(value ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-');
  }

  async signup(dto: SignUpDTO, req: Request): Promise<SignUpResponseDTO> {
    const tenantId = randomUUID();
    const tenantName = String(dto.tenant_name ?? '').trim();
    const tenantSlug = this.normalizeSlug(dto.tenant_slug);
    const adminEmail = String(dto.admin_email ?? '').trim().toLowerCase();

    if (!tenantName || !tenantSlug) {
      throw new BadRequestException('tenant_name and tenant_slug are required.');
    }
    if (!adminEmail) {
      throw new BadRequestException('admin_email is required.');
    }

    const adminPasswordHash = await this.cryptoService.hash(dto.admin_password);

    try {
      const created = await runWithTenant(tenantId, () =>
        this.prisma.raw.$transaction(async (tx) => {
          const tenant = await tx.tenants.create({
            data: {
              id: tenantId,
              name: tenantName,
              slug: tenantSlug,
              status: 1,
            },
          });

          const company = await tx.companies.create({
            data: {
              company_name: dto.company_name,
              phone: dto.company_phone ?? null,
              company_number: dto.company_number ?? null,
              sector: dto.company_sector ?? null,
              category: dto.company_category ?? null,
              address_street: dto.company_address_street ?? null,
              address_number: dto.company_address_number ?? null,
              address_city: dto.company_address_city ?? null,
              address_country: dto.company_address_country ?? null,
              address_state: dto.company_address_state ?? null,
              address_postalcode: dto.company_address_postalcode ?? null,
              language: dto.company_language ?? null,
            } as any,
          });

          const user = await tx.users.create({
            data: {
              tenant_id: tenant.id,
              full_name: dto.admin_full_name,
              email: adminEmail,
              password: adminPasswordHash,
              role: user_role_enum.ADMIN,
              status: user_status_enum.ACTIVE,
              company_id: company.id,
              phonenumber: dto.admin_phone ?? null,
              first_access: false,
              acept_terms: dto.acept_terms ?? true,
            } as any,
          });

          await tx.companies.update({
            where: { id: company.id },
            data: { user_id: user.id } as any,
          });

          await tx.tenants.update({
            where: { id: tenant.id },
            data: { company_id: company.id },
          });

          const systemSavedViews: Prisma.saved_viewsCreateManyInput[] = [
            {
              tenant_id: tenant.id,
              owner_user_id: user.id,
              entity_name: 'invoices',
              name: 'Todos os invoices',
              visibility: view_visibility_enum.PUBLIC,
              definition_json: {
                entityName: 'invoices',
                columns: [],
                filters: [],
                sort: [],
              } as Prisma.InputJsonValue,
              is_system: true,
              is_active: true,
              source: view_source_enum.MANUAL,
            },
            {
              tenant_id: tenant.id,
              owner_user_id: user.id,
              entity_name: 'products',
              name: 'Todos os produtos',
              visibility: view_visibility_enum.PUBLIC,
              definition_json: {
                entityName: 'products',
                columns: [],
                filters: [],
                sort: [],
              } as Prisma.InputJsonValue,
              is_system: true,
              is_active: true,
              source: view_source_enum.MANUAL,
            },
            {
              tenant_id: tenant.id,
              owner_user_id: user.id,
              entity_name: 'companies',
              name: 'Todos os clientes',
              visibility: view_visibility_enum.PUBLIC,
              definition_json: {
                entityName: 'companies',
                columns: [],
                filters: [],
                sort: [],
              } as Prisma.InputJsonValue,
              is_system: true,
              is_active: true,
              source: view_source_enum.MANUAL,
            },
            {
              tenant_id: tenant.id,
              owner_user_id: user.id,
              entity_name: 'leads',
              name: 'Todos os leads',
              visibility: view_visibility_enum.PUBLIC,
              definition_json: {
                entityName: 'leads',
                columns: [],
                filters: [],
                sort: [],
              } as Prisma.InputJsonValue,
              is_system: true,
              is_active: true,
              source: view_source_enum.MANUAL,
            },
            {
              tenant_id: tenant.id,
              owner_user_id: user.id,
              entity_name: 'notifications',
              name: 'Todas as notificacoes',
              visibility: view_visibility_enum.PUBLIC,
              definition_json: {
                entityName: 'notifications',
                columns: [],
                filters: [],
                sort: [],
              } as Prisma.InputJsonValue,
              is_system: true,
              is_active: true,
              source: view_source_enum.MANUAL,
            },
            {
              tenant_id: tenant.id,
              owner_user_id: user.id,
              entity_name: 'processes',
              name: 'Todos os processos',
              visibility: view_visibility_enum.PUBLIC,
              definition_json: {
                entityName: 'processes',
                columns: [],
                filters: [],
                sort: [],
              } as Prisma.InputJsonValue,
              is_system: true,
              is_active: true,
              source: view_source_enum.MANUAL,
            },
          ];

          await tx.saved_views.createMany({
            data: systemSavedViews,
          });

          return { tenant, company, user };
        })
      );

      const payload = {
        sub: created.user.id,
        email: created.user.email,
        role: created.user.role,
        tenant_id: created.tenant.id,
        company_id: created.company.id,
      };

      const access_token = this.jwtService.sign(payload, {
        secret: process.env.JWT_SECRET,
        expiresIn: '1h',
      });

      const refresh_token = this.jwtService.sign(payload, {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: '7d',
      });

      const refresh_token_hash = await this.cryptoService.hash(refresh_token);
      await this.createOrUpdateSession(created.tenant.id, created.user.id, refresh_token_hash, req);

      return {
        tenant_id: created.tenant.id,
        company_id: created.company.id,
        user_id: created.user.id,
        access_token,
        refresh_token,
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new BadRequestException('Duplicate value (email, tenant slug or unique field).');
        }
      }
      throw error;
    }
  }

  private isAdminRole(role: unknown): boolean {
    // Keep it simple and safe (avoid enum import changes in this file).
    return String(role ?? '').toUpperCase() === 'ADMIN';
  }

  private assertTenantAndCompany(user: any): void {
    const tenantId = user?.tenant_id as string | undefined;
    if (!tenantId || String(tenantId).trim().length === 0) {
      throw new BadRequestException('User is missing tenant_id. Please contact support.');
    }

    // For non-admin users, company_id must be present
    const isAdmin = this.isAdminRole(user?.role);
    if (!isAdmin) {
      const companyId = user?.company_id as string | undefined;
      if (!companyId || String(companyId).trim().length === 0) {
        throw new BadRequestException('User is missing company_id. Please contact support.');
      }
    }
  }

  async login(email: string, password: string, req: Request) {
    const user = await this.userService.validateUser(email, password);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    // ✅ Ensure tenant_id / company_id rules before issuing tokens
    this.assertTenantAndCompany(user);

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenant_id: user.tenant_id,
      // ✅ include company_id so req.user has it everywhere
      company_id: user.company_id ?? null,
    };

    const access_token = this.jwtService.sign(payload, {
      secret: process.env.JWT_SECRET,
      expiresIn: '1h',
    });

    const refresh_token = this.jwtService.sign(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: '7d',
    });

    const refresh_token_hash = await this.cryptoService.hash(refresh_token);

    await this.createOrUpdateSession(user.tenant_id, user.id, refresh_token_hash, req);

    return { access_token, refresh_token };
  }

  async refreshToken(refresh_token: string, req: Request) {
    try {
      const decoded = await this.jwtService.verify(refresh_token, {
        secret: process.env.JWT_REFRESH_SECRET,
      });

      const sub = decoded?.sub as string | undefined;
      if (!sub) throw new UnauthorizedException('Invalid refresh token');

      const tenantId = decoded?.tenant_id as string | undefined;
      if (!tenantId) throw new UnauthorizedException('Invalid refresh token');

      // include sessions because we need to validate the stored refresh token hash
      const user = await this.userService.findById(tenantId, sub, true);

      const session = user.sessions;
      if (!session) throw new UnauthorizedException('Session not found');

      const isValid = await this.cryptoService.verify(refresh_token, session.refresh_token);
      if (!isValid) throw new UnauthorizedException('Invalid refresh token');

      // ✅ enforce multi-tenant/company rules also on refresh
      this.assertTenantAndCompany(user);

      const payload_for_new_tokens = {
        sub: user.id,
        email: user.email,
        role: user.role,
        tenant_id: user.tenant_id,
        // ✅ keep company_id in refreshed tokens too
        company_id: user.company_id ?? null,
      };

      const new_access_token = this.jwtService.sign(payload_for_new_tokens, {
        secret: process.env.JWT_SECRET,
        expiresIn: '1h',
      });

      const new_refresh_token = this.jwtService.sign(payload_for_new_tokens, {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: '7d',
      });

      const refresh_token_hash = await this.cryptoService.hash(new_refresh_token);

      await this.createOrUpdateSession(user.tenant_id, user.id, refresh_token_hash, req);

      return { access_token: new_access_token, refresh_token: new_refresh_token };
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async createOrUpdateSession(
    tenant_id: string,
    user_id: string,
    refresh_token: string,
    req: Request
  ) {
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
    // We store refresh_token as a hash in DB. Decode token to get tenant_id and hash the token for lookup.
    const decoded = await this.jwtService.verify(refresh_token, {
      secret: process.env.JWT_REFRESH_SECRET,
    });

    const tenantId = decoded?.tenant_id as string | undefined;
    if (!tenantId) throw new UnauthorizedException('Invalid refresh token');

    const refresh_token_hash = await this.cryptoService.hash(refresh_token);
    await this.userService.logoutAll(tenantId, refresh_token_hash);

    return { message: 'All sessions terminated' };
  }

  async forgotPassword(email: string) {
    try {
      const user = await this.userService.findByEmail(email);

      // Always return the same message (avoid user enumeration)
      if (!user) {
        return {
          message:
            'Se o email existir em nossa base, você receberá as instruções para redefinir sua senha.',
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

      await this.mailerService.sendWelcomeEmail(user.email, 'Redefinição de Senha - GECOM', html);

      return {
        message:
          'Se o email existir em nossa base, você receberá as instruções para redefinir sua senha.',
      };
    } catch {
      return {
        message:
          'Se o email existir em nossa base, você receberá as instruções para redefinir sua senha.',
      };
    }
  }

  async resetPassword(
    user_id: string,
    token: string,
    new_password: string,
    confirm_password: string
  ) {
    if (new_password !== confirm_password) {
      throw new BadRequestException('As senhas não coincidem');
    }

    const reset_record = await this.passwordResetService.getToken(user_id);
    if (!reset_record) {
      throw new BadRequestException('Token de reset inválido ou expirado');
    }

    const tenantId = (reset_record as any)?.tenant_id as string | undefined;
    if (!tenantId) throw new BadRequestException('Token de reset inválido ou expirado');

    const user = await this.userService.findById(tenantId, user_id, true);

    const isValidToken = await this.cryptoService.verify(token, reset_record.token);
    if (!isValidToken) {
      throw new BadRequestException('Token de reset inválido');
    }

    if (reset_record.expires_at < new Date()) {
      await this.passwordResetService.deleteToken(user_id);
      throw new BadRequestException('Token de reset expirado. Solicite um novo reset de senha.');
    }

    if (user.first_access) {
      await this.userService.activateFirstAccess(tenantId, user_id, new_password);
    } else {
      await this.userService.updatePassword(tenantId, user_id, new_password);
    }

    await this.passwordResetService.deleteToken(user_id);

    if (user.sessions) {
      // sessions.refresh_token is already stored as a hash
      await this.userService.logoutAll(tenantId, user.sessions.refresh_token);
    }

    return {
      message: 'Senha redefinida com sucesso. Faça login com sua nova senha.',
    };
  }
}
