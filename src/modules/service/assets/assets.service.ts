import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateAssetDto, UpdateAssetDto } from './assets.dto';
import { AssetsRepository } from './assets.repository';

@Injectable()
export class AssetsService {
  constructor(private readonly repository: AssetsRepository) {}

  list(tenantId: string) {
    return this.repository.findMany(tenantId);
  }

  async getById(tenantId: string, id: string) {
    const row = await this.repository.findById(tenantId, id);
    if (!row) throw new NotFoundException('Ativo não encontrado.');
    return row;
  }

  create(tenantId: string, dto: CreateAssetDto) {
    return this.repository.create(tenantId, dto);
  }

  async update(tenantId: string, id: string, dto: UpdateAssetDto) {
    await this.getById(tenantId, id);
    return this.repository.update(tenantId, id, dto);
  }

  async remove(tenantId: string, id: string) {
    await this.getById(tenantId, id);
    await this.repository.remove(tenantId, id);
  }
}
