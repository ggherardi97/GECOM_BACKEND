import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDTO } from './dto/create.dto';
import { UpdateUserDTO } from './dto/update.dto';
import { CryptoService } from '../crypto/crypto.service';
import { users, user_role_enum, user_status_enum } from '@prisma/client';
import { SessionType } from './types/session.type';
import { handlePrismaError } from '../utils/errors';

@Injectable()
export class UserRepository {
  private logger = new Logger(UserRepository.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cryptoService: CryptoService
  ) {}

  async create(data: CreateUserDTO): Promise<users | null> {
    try {
      return await this.prisma.users.create({
        data: {
          // IMPORTANT:
          // In the (2) approach, tenant_id should come from Prisma middleware.
          // However, your endpoint is @Public, so you might still be passing tenant_id in the payload.
          // Keep this to avoid NOT NULL errors if middleware context is missing here.
          tenant_id: (data as any).tenant_id,
          full_name: data.full_name,
          email: data.email,
          password: data.password ?? '',
          role: (data.role as unknown as user_role_enum) ?? user_role_enum.USER,
          status: (data.status as unknown as user_status_enum) ?? user_status_enum.ACTIVE,
          phonenumber: data.phonenumber ?? null,
          first_access: data.first_access ?? true,
          company_id: data.company_id ?? null,
        } as any,
      });
    } catch (e) {
      this.logger.error(e);
      return null;
    }
  }

  async findAll(): Promise<Omit<users, 'password'>[]> {
    return await this.prisma.users.findMany({
      omit: { password: true },
    });
  }

  async findAllCustomers() {
    try {
      return await this.prisma.users.findMany({
        where: { role: user_role_enum.USER },
        omit: { password: true },
      });
    } catch (error) {
      handlePrismaError(error, 'fetching customers');
    }
  }

  async findById(id: string) {
    return this.prisma.users.findUnique({
      where: { id },
      include: { sessions: true },
    });
  }

  async findByEmail(email: string): Promise<users | null> {
    return await this.prisma.users.findUnique({ where: { email } });
  }

  /**
   * Returns a "safe" user payload (no password), ideal for "who am I" / post-login usage.
   */
  async findPublicByEmail(email: string): Promise<Omit<users, 'password'> | null> {
    return await this.prisma.users.findUnique({
      where: { email },
      select: {
        id: true,
        tenant_id: true,
        full_name: true,
        email: true,
        role: true,
        status: true,
        phonenumber: true,
        first_access: true,
        company_id: true,
        created_at: true,
        updated_at: true,
      },
    });
  }

  async update(id: string, data: UpdateUserDTO): Promise<users> {
    const { role, status, ...rest } = data as any;

    return await this.prisma.users.update({
      where: { id },
      data: {
        ...rest,
        ...(role !== undefined ? { role: role as unknown as user_role_enum } : {}),
        ...(status !== undefined ? { status: status as unknown as user_status_enum } : {}),
        updated_at: new Date(),
      },
    });
  }

  async resetPassword(id: string, newPassword: string): Promise<users> {
    const hashed_password = await this.cryptoService.hash(newPassword);
    return this.prisma.users.update({
      where: { id },
      data: { password: hashed_password },
    });
  }

  async updatePassword(id: string, hashedPassword: string): Promise<users> {
    return this.prisma.users.update({
      where: { id },
      data: { password: hashedPassword },
    });
  }

  async updateStatus(id: string, newStatus: user_status_enum): Promise<users> {
    return await this.prisma.users.update({
      where: { id },
      data: { status: newStatus },
    });
  }

  async remove(id: string): Promise<users> {
    return this.prisma.users.update({
      where: { id },
      data: { status: user_status_enum.DELETED },
    });
  }

  async session(session: SessionType) {
    try {
      await this.prisma.sessions.upsert({
        where: { user_id: session.user_id },
        update: {
          // sessions.tenant_id is NOT NULL - keep consistent
          tenant_id: session.tenant_id,
          refresh_token: session.refresh_token,
          ip_address: session.ip_address,
          device_info: session.device_info,
          expires_at: session.expires_at,
          updated_at: new Date(),
        },
        create: {
          tenant_id: session.tenant_id,
          user_id: session.user_id,
          refresh_token: session.refresh_token,
          ip_address: session.ip_address,
          device_info: session.device_info,
          expires_at: session.expires_at,
        },
      });
    } catch (e) {
      this.logger.error('Error creating/updating session:', e as any);
    }
  }

  async logoutAll(refresh_token: string) {
    await this.prisma.sessions.deleteMany({
      where: { refresh_token },
    });
  }
}
