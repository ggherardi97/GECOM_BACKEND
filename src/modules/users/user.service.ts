import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRepository } from './user.repository';
import { CreateUserDTO } from './dto/create.dto';
import { UpdateUserDTO } from './dto/update.dto';
import { CryptoService } from '../crypto/crypto.service';
import { UserStatusEnum } from './enums';
import { users } from '@prisma/client';
import { SessionType } from './types/session.type';
import { generateToken } from '../utils/generate-token';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PasswordResetService } from '../password-reset/password-reset.service';
import { MailerService } from '../mailer/mailer.service';

@Injectable()
export class UserService {
  constructor(
    private readonly repository: UserRepository,
    private readonly cryptoService: CryptoService,
    private readonly mailerService: MailerService,
    private readonly passwordResetService: PasswordResetService
  ) {}

  async create(data: CreateUserDTO): Promise<any> {
    const { password } = data;
    const emailExists = await this.repository.findByEmail(data.email);

    if (emailExists) {
      throw new BadRequestException('Email already exists');
    }

    const hash_password = await this.cryptoService.hash(password);
    const user = await this.repository.create({ ...data, password: hash_password });

    if (!user) {
      throw new BadRequestException('Failed to create user');
    }

    const token_generated: string = generateToken();
    const token_encrypted = await this.cryptoService.hash(token_generated);

    await this.passwordResetService.generateResetToken({
      token: token_encrypted,
      user_id: user.id,
    });

    const template = readFileSync(
      join(__dirname, '..', 'mailer', 'templates', 'reset-password.html'),
      'utf8'
    );

    const url = `${process.env.FRONTEND_URL}/${user.id}/reset-password?token=${token_generated}`;
    const html = template.replace('{{name}}', user.full_name).replace('{{resetLink}}', url);
    await this.mailerService.sendWelcomeEmail(user.email, 'Welcome a Gecom!', html);

    return { message: 'User created successfully. Check your email for the reset link.' };
  }

  async findAll(): Promise<Omit<users, 'password'>[]> {
    return this.repository.findAll();
  }

  async findAllCustomers() {
    return this.repository.findAllCustomers();
  }

  async findById(id: string) {
    const user = await this.repository.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findByEmail(email: string): Promise<users> {
    const user = await this.repository.findByEmail(email);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async validateUser(email: string, password: string): Promise<users> {
    const user = await this.findByEmail(email);
    if (!user) throw new NotFoundException('User not found');

    const isPasswordValid = await this.cryptoService.verify(password, user.password);
    if (!isPasswordValid) throw new BadRequestException('Invalid password');
    return user;
  }

  async update(id: string, data: UpdateUserDTO): Promise<users> {
    const user = await this.repository.findById(id);
    if (!user) throw new NotFoundException('User not found');

    return this.repository.update(id, data);
  }

  async resetPassword(id: string, token: string, newPassword: string): Promise<any> {
    const user = await this.repository.findById(id);
    if (!user) throw new NotFoundException('User not found');

    const record = (await this.passwordResetService.getToken(user.id)) as {
      user_id: string;
      token: string;
      expires_at: Date;
    };

    if (!record) throw new BadRequestException('Invalid or expired reset token');

    const isValid = await this.cryptoService.verify(token, record.token);
    if (!isValid) throw new BadRequestException('Invalid reset token');

    if (record.expires_at < new Date()) throw new BadRequestException('Reset token expired');

    await this.passwordResetService.deleteToken(record.user_id);

    const hash = await this.cryptoService.hash(newPassword);
    await this.repository.resetPassword(id, hash);

    return { message: 'Reset password successful. You can now log in with your new password.' };
  }

  async updateStatus(id: string, status: UserStatusEnum): Promise<users> {
    const user = await this.repository.findById(id);
    if (!user) throw new NotFoundException('User not found');

    return this.repository.updateStatus(id, status);
  }

  async remove(id: string): Promise<users> {
    const user = await this.repository.findById(id);
    if (!user) throw new NotFoundException('User not found');

    return this.repository.updateStatus(id, UserStatusEnum.DELETED);
  }

  async createOrUpdateSession(session: SessionType) {
    await this.repository.session(session);
  }

  async logoutAll(refresh_token: string) {
    await this.repository.logoutAll(refresh_token);
  }

  async updatePassword(id: string, hashedPassword: string): Promise<users> {
    return this.repository.updatePassword(id, hashedPassword);
  }
}
