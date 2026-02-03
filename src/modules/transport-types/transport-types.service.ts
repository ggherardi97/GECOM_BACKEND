import { Injectable, NotFoundException } from "@nestjs/common";
import { TransportTypesRepository } from "./transport-types.repository";
import { CreateTransportTypeDto } from "./dto/create-transport-type.dto";
import { UpdateTransportTypeDto } from "./dto/update-transport-type.dto";

@Injectable()
export class TransportTypesService {
  constructor(private readonly repo: TransportTypesRepository) {}

  public async list() {
    return this.repo.findMany();
  }

  public async getById(id: string) {
    const item = await this.repo.findById(id);
    if (!item) throw new NotFoundException("Transport type not found.");
    return item;
  }

  public async create(dto: CreateTransportTypeDto) {
    const name = dto.name?.trim();
    return this.repo.create({ name });
  }

  public async update(id: string, dto: UpdateTransportTypeDto) {
    await this.getById(id); // ensures 404 if not exists

    const patch: { name?: string } = {};
    if (dto.name != null) patch.name = dto.name.trim();

    return this.repo.update(id, patch);
  }

  public async delete(id: string) {
    await this.getById(id); // ensures 404 if not exists
    await this.repo.delete(id);
    return;
  }
}