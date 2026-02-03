import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, events } from "@prisma/client";
import { EventRepository } from "./event.repository";

type FindEventsFilter = {
  type?: number;
  related_table?: string;
  related_id?: string;
  process_id?: string;
  client_id?: string;
};

@Injectable()
export class EventService {
  constructor(private readonly repo: EventRepository) {}

  async findMany(filter: FindEventsFilter): Promise<events[]> {
    return this.repo.findMany(filter);
  }

  // ✅ Compatibility alias (used by ProcessService)
  async listEventsByRelated(relatedTable: string, relatedId: string): Promise<events[]> {
    return this.findMany({
      related_table: relatedTable,
      related_id: relatedId,
    });
  }

  async findById(id: string): Promise<events> {
    const found = await this.repo.findById(id);
    if (!found) throw new NotFoundException("Evento não encontrado.");
    return found;
  }

  async create(body: Prisma.eventsCreateInput): Promise<events> {
    return this.repo.create(body);
  }

  async patchById(id: string, body: Prisma.eventsUpdateInput): Promise<events> {
    await this.findById(id);
    return this.repo.updateById(id, body);
  }

  async deleteById(id: string): Promise<{ ok: true }> {
    await this.findById(id);
    await this.repo.deleteById(id);
    return this.repo.deleteById(id).then(() => ({ ok: true }));
  }
}