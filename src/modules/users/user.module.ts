import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserRepository } from './user.repository';
import { UserService } from './user.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { CryptoModule } from '../crypto/crypto.module';
import { MailModule } from '../mailer/mailer.module';
import { PasswordResetModule } from '../password-reset/password-reset.module';

@Module({
  imports: [PrismaModule, CryptoModule, MailModule, PasswordResetModule],
  controllers: [UserController],
  providers: [UserService, UserRepository],
  exports: [UserService],
})
export class UserModule {}
