import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateUserDTO } from '../dto/create.dto';
import { UpdateUserDTO } from '../dto/update.dto';
import { CryptoService } from '../../crypto/crypto.service';
import { users, user_role_enum, user_status_enum } from '@prisma/client';

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
        },
      });
    } catch (e) {
      this.logger.error(e);
      return null;
    }
  }

  async findAll(): Promise<users[]> {
    return await this.prisma.users.findMany();
  }

  async findById(id: string): Promise<users | null> {
    return await this.prisma.users.findUnique({ where: { id } });
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

  async updatePassword(id: string, newPassword: string): Promise<users> {
    const hashedPassword = await this.cryptoService.hash(newPassword);
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
}
