import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { handlePrismaError } from '../utils/errors';
import { GenerateResetTokenType } from '../types/generate-reset-token.type';

@Injectable()
export class PasswordResetRepository {
  constructor(private readonly prisma: PrismaService) {}

  async generateResetToken(input: GenerateResetTokenType): Promise<GenerateResetTokenType> {
    console.log(input);

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    try {
      return await this.prisma.password_resets.upsert({
        where: { user_id: input.user_id },
        update: {
          tenant_id: input.tenant_id, // <-- FIX
          token: input.token,
          expires_at: expiresAt,
        },
        create: {
          tenant_id: input.tenant_id, // <-- FIX
          user_id: input.user_id,
          token: input.token,
          expires_at: expiresAt,
        },
      });
    } catch (error) {
      handlePrismaError(error, 'generate reset token');
      throw error;
    }
  }

  async getToken(user_id: string): Promise<any> {
    const record = await this.prisma.password_resets.findUnique({
      where: { user_id },
    });

    if (!record) return null;
    return record;
  }

  async deleteToken(user_id: string) {
    return this.prisma.password_resets.delete({
      where: { user_id },
    });
  }
}
