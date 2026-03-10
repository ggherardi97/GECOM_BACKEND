import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, user_role_enum, user_status_enum, users } from '@prisma/client';
import { CryptoService } from 'src/modules/crypto/crypto.service';
import { CreateUserDTO } from './dto/create.dto';
import { UpdateUserDTO } from './dto/update.dto';
import { UpdateMyProfileDTO } from './dto/update-my-profile.dto';
import { UpdateProfilePictureDTO } from './dto/update-profile-picture.dto';
import { UserRole, UserStatusEnum } from './enums';
import { UserRepository, UserSafe } from './user.repository';
import { PasswordResetService } from '../password-reset/password-reset.service';
import { MailerService } from '../mailer/mailer.service';
import { generateToken } from '../utils/generate-token';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  applyEmailTemplateBranding,
  getPortalBrandIdentity,
  resolvePortalBaseUrlFromHost,
  resolvePortalBrandFromHost,
} from '../../common/branding/portal-brand.util';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB

function decodeBase64ToBuffer(input: string): Buffer {
  const raw = String(input ?? '').trim();
  if (!raw) throw new BadRequestException('Image base64 is required.');

  const base64 = raw.includes('base64,') ? (raw.split('base64,').pop() ?? '') : raw;

  const buf = Buffer.from(base64, 'base64');
  if (!buf || buf.length === 0) throw new BadRequestException('Invalid base64 image.');
  if (buf.length > MAX_IMAGE_BYTES) throw new BadRequestException('Image exceeds 5MB limit.');

  return buf;
}

@Injectable()
export class UserService {
  constructor(
    private readonly repository: UserRepository,
    private readonly crypto: CryptoService,
    private readonly passwordResetService: PasswordResetService,
    private readonly mailerService: MailerService
  ) {}

  async findAll(tenantId: string, query?: { company_id?: string; role?: string; status?: string }) {
    const role =
      query?.role != null && String(query.role).trim().length > 0
        ? String(query.role).toUpperCase()
        : undefined;
    const status =
      query?.status != null && String(query.status).trim().length > 0
        ? String(query.status).toUpperCase()
        : undefined;

    const roleEnum =
      role && (user_role_enum as any)[role]
        ? ((user_role_enum as any)[role] as user_role_enum)
        : undefined;
    const statusEnum =
      status && (user_status_enum as any)[status]
        ? ((user_status_enum as any)[status] as user_status_enum)
        : undefined;

    return this.repository.findAll({
      tenant_id: tenantId,
      company_id: query?.company_id,
      role: roleEnum,
      status: statusEnum,
    });
  }

  async findById(tenantId: string, id: string, includeSessions = false): Promise<UserSafe> {
    const user = await this.repository.findById(tenantId, id, includeSessions);
    if (!user) throw new NotFoundException('User not found.');
    return user;
  }

  async findByEmail(email: string): Promise<users> {
    const normalized = String(email ?? '')
      .trim()
      .toLowerCase();
    const user = await this.repository.findByEmail(normalized);
    if (!user) throw new NotFoundException('User not found.');
    return user;
  }

  async create(
    tenantId: string,
    data: CreateUserDTO,
    portalRequest?: { host?: string | null; protocol?: string | null },
  ): Promise<UserSafe> {
    const email = String(data.email ?? '')
      .trim()
      .toLowerCase();
    if (!email) throw new BadRequestException('Email is required.');
    const isFirstAccess = data.first_access ?? true;

    const hashedPassword = await this.crypto.hash(data.password);

    const user = await this.repository.create({
      tenant_id: tenantId,
      email,
      password: hashedPassword,
      full_name: data.full_name,
      role: (data.role ?? UserRole.USER) as any as user_role_enum,
      status: (data.status ?? UserStatusEnum.ACTIVE) as any as user_status_enum,
      company_id: data.company_id ?? null,
      phonenumber: data.phonenumber ?? null,
      first_access: isFirstAccess,

      // New fields default behavior
      acept_terms: false,
      profile_picture: null,
    } satisfies Prisma.usersUncheckedCreateInput);

    if (isFirstAccess) {
      try {
        const portalBrand = resolvePortalBrandFromHost(portalRequest?.host);
        const brandIdentity = getPortalBrandIdentity(portalBrand);

        const resetToken = generateToken(32);
        const tokenHash = await this.crypto.hash(resetToken);

        await this.passwordResetService.generateResetToken({
          tenant_id: tenantId,
          token: tokenHash,
          user_id: user.id,
        } as any);

        const templatePath = join(__dirname, '..', 'mailer', 'templates', 'first-access.html');
        const template = readFileSync(templatePath, 'utf8');
        const frontendBaseUrl = resolvePortalBaseUrlFromHost(
          portalRequest?.host,
          portalRequest?.protocol,
        );
        const resetLink = `${frontendBaseUrl}?token=${resetToken}&userId=${user.id}`;
        const currentYear = new Date().getFullYear();

        const html = applyEmailTemplateBranding(template, portalBrand)
          .replace(/{{name}}/g, user.full_name)
          .replace(/{{resetLink}}/g, resetLink)
          .replace(/{{year}}/g, currentYear.toString());

        await this.mailerService.sendWelcomeEmail(
          user.email,
          `Bem-vindo ao ${brandIdentity.subjectBrandName} - Definicao de Senha`,
          html,
        );
      } catch (error) {
        console.error('Failed to send first access email:', error);
      }
    }

    return user;
  }

  async update(tenantId: string, id: string, data: UpdateUserDTO): Promise<UserSafe> {
    const patch: Prisma.usersUncheckedUpdateInput = {
      ...(data.full_name != null ? { full_name: data.full_name } : {}),
      ...(data.email != null ? { email: String(data.email).trim().toLowerCase() } : {}),
      ...(data.company_id !== undefined ? { company_id: data.company_id ?? null } : {}),
      ...(data.phonenumber !== undefined ? { phonenumber: data.phonenumber ?? null } : {}),
      ...(data.first_access !== undefined ? { first_access: data.first_access } : {}),
      ...(data.role != null
        ? { role: String(data.role).toUpperCase() as any as user_role_enum }
        : {}),
      ...(data.status != null
        ? { status: String(data.status).toUpperCase() as any as user_status_enum }
        : {}),
    };

    if (data.password != null && String(data.password).trim().length > 0) {
      patch.password = await this.crypto.hash(String(data.password));
    }

    return this.repository.update(tenantId, id, patch);
  }

  async remove(tenantId: string, id: string): Promise<UserSafe> {
    return this.repository.remove(tenantId, id);
  }

  async validateUser(email: string, password: string): Promise<users> {
    const normalized = String(email ?? '')
      .trim()
      .toLowerCase();
    const user = await this.repository.findByEmail(normalized);

    if (!user) throw new NotFoundException('Invalid credentials.');
    if (user.status === user_status_enum.DELETED)
      throw new NotFoundException('Invalid credentials.');
    if (user.status !== user_status_enum.ACTIVE)
      throw new BadRequestException('User is not active.');

    const ok = await this.crypto.verify(password, user.password);
    if (!ok) throw new NotFoundException('Invalid credentials.');

    return user;
  }

  async createOrUpdateSession(input: {
    tenant_id: string;
    user_id: string;
    refresh_token: string;
    expires_at: Date;
    device_info?: string | null;
    ip_address?: string | null;
  }): Promise<void> {
    await this.repository.createOrUpdateSession(input);
  }

  async logoutAll(tenantId: string, refresh_token: string): Promise<void> {
    await this.repository.logoutAll(tenantId, refresh_token);
  }

  async updatePassword(tenantId: string, id: string, password: string): Promise<UserSafe> {
    const hashed = await this.crypto.hash(password);
    return this.repository.updatePassword(tenantId, id, hashed);
  }

  async activateFirstAccess(tenantId: string, id: string, password: string): Promise<UserSafe> {
    const hashed = await this.crypto.hash(password);
    return this.repository.update(tenantId, id, {
      password: hashed,
      status: user_status_enum.ACTIVE,
      first_access: false,
    });
  }

  // -----------------------
  // NEW: "My profile" APIs
  // -----------------------

  async updateMyProfile(
    tenantId: string,
    userId: string,
    dto: UpdateMyProfileDTO
  ): Promise<UserSafe> {
    const patch: Prisma.usersUncheckedUpdateInput = {
      ...(dto.full_name != null ? { full_name: dto.full_name } : {}),
      ...(dto.phonenumber !== undefined ? { phonenumber: dto.phonenumber ?? null } : {}),
      ...(dto.acept_terms === true ? { acept_terms: true } : {}),
    };

    if (dto.password != null && String(dto.password).trim().length > 0) {
      patch.password = await this.crypto.hash(String(dto.password));
      patch.first_access = false;
    }

    return this.repository.update(tenantId, userId, patch);
  }

  async acceptMyTerms(tenantId: string, userId: string): Promise<UserSafe> {
    return this.repository.acceptTerms(tenantId, userId);
  }
  async getProfilePicture(userId: string, tenantId: string) {
    const user = await this.repository.findProfilePictureById(userId, tenantId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      profile_picture: user.profile_picture,
    };
  }

  async updateMyProfilePicture(
    tenantId: string,
    userId: string,
    dto: UpdateProfilePictureDTO
  ): Promise<UserSafe> {
    if (!dto.base64 || String(dto.base64).trim().length === 0) {
      // allow "clear" via empty
      return this.repository.updateProfilePicture(tenantId, userId, null);
    }

    const buffer = decodeBase64ToBuffer(dto.base64);
    return this.repository.updateProfilePicture(tenantId, userId, buffer);
  }

  async getMyProfilePictureBase64(
    tenantId: string,
    userId: string
  ): Promise<{ base64: string | null }> {
    const bytes = await this.repository.getProfilePicture(tenantId, userId);
    if (!bytes) return { base64: null };

    const base64 = Buffer.from(bytes).toString('base64');
    return { base64 };
  }
}

