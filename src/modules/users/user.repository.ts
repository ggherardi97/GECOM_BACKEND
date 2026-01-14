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
        full_name: data.full_name,
        email: data.email,
        password: data.password,
        role: data.role || user_role_enum.USER,
        status: data.status || user_status_enum.ACTIVE,
        phonenumber: data.phonenumber ?? null,
        first_access: data.first_access ?? true,
      },
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
        where: { role: user_role_enum.CUSTOMER as user_role_enum },
        omit: { password: true },
      });
    } catch (error) {
      handlePrismaError(error, 'fetching customers');
    }
  }

  async findById(id: string) {
    return this.prisma.users.findUnique({ where: { id }, include: { sessions: true } });
  }

  async findByEmail(email: string): Promise<users | null> {
    return await this.prisma.users.findUnique({ where: { email } });
  }

  async update(id: string, data: UpdateUserDTO): Promise<users> {
    return await this.prisma.users.update({
      where: { id },
      data: {
        ...data,
        updated_at: new Date().toISOString(),
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
      data: {
        status: newStatus,
      },
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
        where: {
          user_id: session.user_id,
        },
        update: {
          refresh_token: session.refresh_token,
          ip_address: session.ip_address,
          device_info: session.device_info,
          expires_at: session.expires_at,
          updated_at: new Date(),
        },
        create: {
          user_id: session.user_id,
          refresh_token: session.refresh_token,
          ip_address: session.ip_address,
          device_info: session.device_info,
          expires_at: session.expires_at,
        },
      });
    } catch (e) {
      this.logger.error('Error creating/updating session:', e);
    }
  }

  async logoutAll(refresh_token: string) {
    await this.prisma.sessions.deleteMany({
      where: { refresh_token: refresh_token },
    });
  }
}
