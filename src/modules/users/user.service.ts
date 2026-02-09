import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, user_role_enum, user_status_enum, users } from '@prisma/client';
import { CryptoService } from 'src/modules/crypto/crypto.service';
import { CreateUserDTO } from './dto/create.dto';
import { UpdateUserDTO } from './dto/update.dto';
import { UserRole, UserStatusEnum } from './enums';
import { UserRepository, UserSafe } from './user.repository';

@Injectable()
export class UserService {
  constructor(
    private readonly repository: UserRepository,
    private readonly crypto: CryptoService,
  ) {}

  async findAll(tenantId: string, query?: { company_id?: string; role?: string; status?: string }) {
    const role = query?.role != null && String(query.role).trim().length > 0 ? String(query.role).toUpperCase() : undefined;
    const status = query?.status != null && String(query.status).trim().length > 0 ? String(query.status).toUpperCase() : undefined;

    const roleEnum = role && (user_role_enum as any)[role] ? ((user_role_enum as any)[role] as user_role_enum) : undefined;
    const statusEnum = status && (user_status_enum as any)[status] ? ((user_status_enum as any)[status] as user_status_enum) : undefined;

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
    const normalized = String(email ?? '').trim().toLowerCase();
    const user = await this.repository.findByEmail(normalized);
    if (!user) throw new NotFoundException('User not found.');
    return user;
  }

  async create(tenantId: string, data: CreateUserDTO): Promise<UserSafe> {
    const email = String(data.email ?? '').trim().toLowerCase();
    if (!email) throw new BadRequestException('Email is required.');

    const hashedPassword = await this.crypto.hash(data.password);

    return this.repository.create({
      tenant_id: tenantId,
      email,
      password: hashedPassword,
      full_name: data.full_name,
      role: ((data.role ?? UserRole.USER) as any) as user_role_enum,
      status: ((data.status ?? UserStatusEnum.ACTIVE) as any) as user_status_enum,
      company_id: data.company_id ?? null,
      phonenumber: data.phonenumber ?? null,
      first_access: data.first_access ?? true,
    } satisfies Prisma.usersUncheckedCreateInput);
  }

  async update(tenantId: string, id: string, data: UpdateUserDTO): Promise<UserSafe> {
    const patch: Prisma.usersUncheckedUpdateInput = {
      ...(data.full_name != null ? { full_name: data.full_name } : {}),
      ...(data.email != null ? { email: String(data.email).trim().toLowerCase() } : {}),
      ...(data.company_id !== undefined ? { company_id: data.company_id ?? null } : {}),
      ...(data.phonenumber !== undefined ? { phonenumber: data.phonenumber ?? null } : {}),
      ...(data.first_access !== undefined ? { first_access: data.first_access } : {}),
      ...(data.role != null ? { role: (String(data.role).toUpperCase() as any) as user_role_enum } : {}),
      ...(data.status != null ? { status: (String(data.status).toUpperCase() as any) as user_status_enum } : {}),
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
    const normalized = String(email ?? '').trim().toLowerCase();
    const user = await this.repository.findByEmail(normalized);

    if (!user) throw new NotFoundException('Invalid credentials.');
    if (user.status === user_status_enum.DELETED) throw new NotFoundException('Invalid credentials.');
    if (user.status !== user_status_enum.ACTIVE) throw new BadRequestException('User is not active.');

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
}
