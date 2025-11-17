import { Injectable } from '@nestjs/common';
import { PasswordResetRepository } from './password-reset.repository';
import { GenerateResetTokenType } from '../types/generate-reset-token.type';

@Injectable()
export class PasswordResetService {
  constructor(private readonly passwordResetRepository: PasswordResetRepository) {}

  async generateResetToken(input: GenerateResetTokenType): Promise<GenerateResetTokenType>{
    return await this.passwordResetRepository.generateResetToken(input);
  }

  async getToken(user_id: string): Promise<any> {
    return await this.passwordResetRepository.getToken(user_id);
  }

  async deleteToken(user_id: string) {
    return await this.passwordResetRepository.deleteToken(user_id);
  }
}
