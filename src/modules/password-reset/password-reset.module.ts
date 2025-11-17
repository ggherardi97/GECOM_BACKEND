import { Module } from '@nestjs/common';
import { PasswordResetRepository } from './password-reset.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { PasswordResetService } from './password-reset.service';

@Module({
  imports: [],
  controllers: [],
  providers: [PasswordResetModule, PasswordResetService, PasswordResetRepository, PrismaService],
  exports: [PasswordResetService],
})
export class PasswordResetModule {}
