import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { UserModule } from '../users/user.module';
import { CryptoModule } from '../crypto/crypto.module';
import { PasswordResetModule } from '../password-reset/password-reset.module';
import { MailModule } from '../mailer/mailer.module';

// NEW: /auth/me (refresh-cookie based)
import { AuthMeController } from './auth-me.controller';
import { RefreshSessionGuard } from './guards/refresh-session.guard';

// IMPORTANT: adjust import according to your project structure
// If you have PrismaModule, use it. If you only have PrismaService, see note below.
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [
    UserModule,
    PassportModule,
    CryptoModule,
    PasswordResetModule,
    MailModule,
    PrismaModule, // NEW: needed for RefreshSessionGuard + AuthMeController
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '15m' },
    }),
  ],
  controllers: [
    AuthController,
    AuthMeController, // NEW
  ],
  providers: [
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
    RefreshSessionGuard, // NEW
    {
      provide: APP_GUARD,
      useExisting: JwtAuthGuard,
    },
  ],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}
