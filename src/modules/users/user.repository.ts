import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma, user_role_enum, user_status_enum, users, sessions } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

export type UserSafe = Omit<users, 'password'> & { sessions?: sessions | null };

const userSafeSelect = {
  id: true,
  tenant_id: true,
  full_name: true,
  email: true,
  role: true,
  status: true,
  created_at: true,
  updated_at: true,
  company_id: true,
  phonenumber: true,
  first_access: true,

  acept_terms: true,
  company:{
    select:{
      company_name:true,
      id:true,
    }
  }

} satisfies Prisma.usersSelect;

const userSafeWithSessionsSelect = {
  ...userSafeSelect,
  sessions: true,
} satisfies Prisma.usersSelect;

function toBadRequestFromPrisma(error: unknown): never {
  if (error instanceof PrismaClientKnownRequestError) {
    if (error.code === 'P2002') throw new BadRequestException('Duplicate value (unique constraint).');
    if (error.code === 'P2025') throw new NotFoundException('Record not found.');
  }
  throw error as any;
}

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: {
    tenant_id: string;
    company_id?: string;
    role?: user_role_enum;
    status?: user_status_enum;
  }): Promise<UserSafe[]> {
    try {
      return (await this.prisma.users.findMany({
        where: {
          tenant_id: filters.tenant_id,
          status: { not: user_status_enum.DELETED },
          ...(filters.company_id ? { company_id: filters.company_id } : {}),
          ...(filters.role ? { role: filters.role } : {}),
          ...(filters.status ? { status: filters.status } : {}),
        },
        orderBy: { created_at: 'desc' },
        select: userSafeSelect,
      })) as any;
    } catch (error) {
      toBadRequestFromPrisma(error);
    }
  }

  async findById(tenantId: string, id: string, includeSessions = false): Promise<UserSafe | null> {
    try {
      if (includeSessions) {
        return (await this.prisma.users.findFirst({
          where: {
            id,
            tenant_id: tenantId,
            status: { not: user_status_enum.DELETED },
          },
          select: userSafeWithSessionsSelect,
        })) as any;
      }

      return (await this.prisma.users.findFirst({
        where: {
          id,
          tenant_id: tenantId,
          status: { not: user_status_enum.DELETED },
        },
        select: userSafeSelect,
      })) as any;
    } catch (error) {
      toBadRequestFromPrisma(error);
    }
  }

  /**
   * ✅ AUTH PURPOSES (returns password hash)
   * Keep this method returning full users record (includes password).
   * This preserves the previous behavior for login/crypto.verify.
   */
  async findByEmail(email: string): Promise<users | null> {
    try {
      return await this.prisma.users.findUnique({
        where: { email },
      });
    } catch (error) {
      toBadRequestFromPrisma(error);
    }
  }

  /**
   * ✅ SAFE PURPOSES (no password, includes profile_picture)
   * Use this in endpoints that return the user to the client.
   */
  async findSafeByEmail(email: string): Promise<UserSafe | null> {
    try {
      return (await this.prisma.users.findUnique({
        where: { email },
        select: userSafeSelect,
      })) as any;
    } catch (error) {
      toBadRequestFromPrisma(error);
    }
  }

  async create(data: Prisma.usersUncheckedCreateInput): Promise<UserSafe> {
    try {
      const row = await this.prisma.users.create({
        data,
        select: userSafeSelect,
      });

      return row as any;
    } catch (error) {
      toBadRequestFromPrisma(error);
    }
  }

  async update(tenantId: string, id: string, data: Prisma.usersUncheckedUpdateInput): Promise<UserSafe> {
    try {
      const result = await this.prisma.users.updateMany({
        where: {
          id,
          tenant_id: tenantId,
          status: { not: user_status_enum.DELETED },
        },
        data: {
          ...data,
          updated_at: new Date(),
        },
      });

      if (!result || result.count === 0) {
        throw new NotFoundException('User not found.');
      }

      const row = await this.prisma.users.findFirst({
        where: {
          id,
          tenant_id: tenantId,
          status: { not: user_status_enum.DELETED },
        },
        select: userSafeSelect,
      });

      if (!row) throw new NotFoundException('User not found.');

      return row as any;
    } catch (error) {
      toBadRequestFromPrisma(error);
    }
  }

  async updatePassword(tenantId: string, id: string, password: string): Promise<UserSafe> {
    return this.update(tenantId, id, { password });
  }

  async updateStatus(tenantId: string, id: string, status: user_status_enum): Promise<UserSafe> {
    return this.update(tenantId, id, { status });
  }

  async remove(tenantId: string, id: string): Promise<UserSafe> {
    return this.updateStatus(tenantId, id, user_status_enum.DELETED);
  }
async findProfilePictureById(userId: string, tenantId: string) {
  return this.prisma.users.findFirst({
    where: {
      id: userId,
      tenant_id: tenantId,
    },
    select: {
      profile_picture: true,
    },
  });
}

  // NEW: update picture (Buffer -> bytea)
  async updateProfilePicture(tenantId: string, id: string, picture: Buffer | null): Promise<UserSafe> {
    const bytes = picture ? (new Uint8Array(picture) as Prisma.Bytes) : null;
    return this.update(tenantId, id, { profile_picture: bytes });
  }

  // NEW: accept terms
  async acceptTerms(tenantId: string, id: string): Promise<UserSafe> {
    return this.update(tenantId, id, { acept_terms: true });
  }

  // NEW: get picture only (avoid big payload everywhere)
  async getProfilePicture(tenantId: string, id: string): Promise<Uint8Array | null> {
    const row = await this.prisma.users.findFirst({
      where: {
        id,
        tenant_id: tenantId,
        status: { not: user_status_enum.DELETED },
      },
      select: { profile_picture: true },
    });

    return (row?.profile_picture as Uint8Array | null) ?? null;
  }

  async createOrUpdateSession(input: {
    tenant_id: string;
    user_id: string;
    refresh_token: string;
    expires_at: Date;
    device_info?: string | null;
    ip_address?: string | null;
  }): Promise<void> {
    await this.prisma.sessions.upsert({
      where: { user_id: input.user_id },
      create: {
        tenant_id: input.tenant_id,
        user_id: input.user_id,
        refresh_token: input.refresh_token,
        expires_at: input.expires_at,
        device_info: input.device_info ?? null,
        ip_address: input.ip_address ?? null,
      },
      update: {
        tenant_id: input.tenant_id,
        refresh_token: input.refresh_token,
        expires_at: input.expires_at,
        device_info: input.device_info ?? null,
        ip_address: input.ip_address ?? null,
        updated_at: new Date(),
      },
    });
  }

  async logoutAll(tenantId: string, refresh_token: string): Promise<void> {
    await this.prisma.sessions.deleteMany({
      where: {
        tenant_id: tenantId,
        refresh_token,
      },
    });
  }
}
