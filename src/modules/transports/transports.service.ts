import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, transports } from '@prisma/client';
import { TransportsRepository } from './transports.repository';

type FindTransportsFilter = {
  process_id?: string;
  transport_type_id?: string;
  transport_status_id?: string;
};

@Injectable()
export class TransportsService {
  constructor(private readonly transportsRepository: TransportsRepository) {}

  async findMany(filter: FindTransportsFilter): Promise<transports[]> {
    return this.transportsRepository.findMany(filter);
  }

  async findById(id: string): Promise<transports> {
    const found = await this.transportsRepository.findById(id);
    if (!found) throw new NotFoundException('Transporte não encontrado.');
    return found;
  }

  async create(body: Prisma.transportsCreateInput): Promise<transports> {
    return this.transportsRepository.create(body);
  }

  async patchById(id: string, body: Prisma.transportsUpdateInput): Promise<transports> {
    await this.findById(id);
    return this.transportsRepository.updateById(id, body);
  }

  async deleteById(id: string): Promise<{ ok: true }> {
    await this.findById(id);
    await this.transportsRepository.deleteById(id);
    return { ok: true };
  }

  async findAllTransportTypes() {
    return this.transportsRepository.findAllTransportTypes();
  }
}
