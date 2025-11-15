import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRepository } from './user.repository';
import { CreateUserDTO } from './dto/create.dto';
import { UpdateUserDTO } from './dto/update.dto';
import { CryptoService } from '../crypto/crypto.service';
import { UserStatusEnum } from './enums';
import { users } from '@prisma/client';
import { SessionType } from './types/session.type';

@Injectable()
export class UserService {
  constructor(
    private readonly repository: UserRepository,
    private readonly cryptoService: CryptoService
  ) {}

  async create(data: CreateUserDTO): Promise<users> {
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
    return user;
  }

  async findAll(): Promise<users[]> {
    return this.repository.findAll();
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

  async updatePassword(id: string, newPassword: string): Promise<users> {
    const user = await this.repository.findById(id);
    if (!user) throw new NotFoundException('User not found');

    const hash = await this.cryptoService.hash(newPassword);
    return this.repository.updatePassword(id, hash);
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
}
