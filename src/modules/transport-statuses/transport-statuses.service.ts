import { Injectable, NotFoundException } from "@nestjs/common";
import { TransportStatusesRepository } from "./transport-statuses.repository";
import { CreateTransportStatusDto } from "./dto/create-transport-status.dto";
import { UpdateTransportStatusDto } from "./dto/update-transport-status.dto";

@Injectable()
export class TransportStatusesService {
  constructor(private readonly repo: TransportStatusesRepository) {}

  public async list() {
    return this.repo.findMany();
  }

  public async getById(id: string) {
    const item = await this.repo.findById(id);
    if (!item) throw new NotFoundException("Transport status not found.");
    return item;
  }

  public async create(dto: CreateTransportStatusDto) {
    const name = dto.name.trim();
    return this.repo.create({ name });
  }

  public async update(id: string, dto: UpdateTransportStatusDto) {
    await this.getById(id); // ensures 404

    const patch: { name?: string } = {};
    if (dto.name != null) patch.name = dto.name.trim();

    return this.repo.update(id, patch);
  }

  public async delete(id: string) {
    await this.getById(id); // ensures 404
    await this.repo.delete(id);
    return;
  }
}