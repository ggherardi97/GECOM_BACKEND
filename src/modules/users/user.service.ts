import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRepository } from './repositories/user.repository';
import { CreateUserDTO } from './dto/create.dto';
import { UpdateUserDTO } from './dto/update.dto';
import { CryptoService } from '../crypto/crypto.service';
import { UserStatusEnum } from './enums';

@Injectable()
export class UserService {
  constructor(
    private readonly repository: UserRepository,
    private readonly cryptoService: CryptoService
  ) {}

  async create(data: CreateUserDTO) {
    const { password } = data;
    const emailExists = await this.repository.findByEmail(data.email);

    if (emailExists) {
      throw new BadRequestException('Email already exists');
    }

    const hash_password = await this.cryptoService.hash(password);
    return this.repository.create({ ...data, password: hash_password });
  }

  async findAll() {
    return this.repository.findAll();
  }

  async findById(id: string) {
    const user = await this.repository.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async update(id: string, data: UpdateUserDTO) {
    const user = await this.repository.findById(id);
    if (!user) throw new NotFoundException('User not found');

    return this.repository.update(id, data);
  }

  async updatePassword(id: string, newPassword: string) {
    const user = await this.repository.findById(id);
    if (!user) throw new NotFoundException('User not found');

    const hash = await this.cryptoService.hash(newPassword);
    return this.repository.updatePassword(id, hash);
  }

  async updateStatus(id: string, status: UserStatusEnum) {
    const user = await this.repository.findById(id);
    if (!user) throw new NotFoundException('User not found');

    return this.repository.updateStatus(id, status);
  }

  async remove(id: string) {
    const user = await this.repository.findById(id);
    if (!user) throw new NotFoundException('User not found');

    return this.repository.updateStatus(id, UserStatusEnum.DELETED);
  }
}
