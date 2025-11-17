import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { handlePrismaError } from '../utils/errors';
import { GenerateResetTokenType } from '../types/generate-reset-token.type';

@Injectable()
export class PasswordResetRepository {
  constructor(private readonly prisma: PrismaService) {}

  async generateResetToken(input: GenerateResetTokenType): Promise<GenerateResetTokenType> {
    console.log(input);
    try {
      return await this.prisma.password_resets.upsert({
        where: { user_id: input.user_id },
        update: {
          token: input.token,
          expires_at: new Date(Date.now() + 60 * 60 * 1000),
        },
        create: {
          user_id: input.user_id,
          token: input.token,
          expires_at: new Date(Date.now() + 60 * 60 * 1000),
        },
      });
    } catch (error) {
      handlePrismaError(error, 'generate reset token');
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
