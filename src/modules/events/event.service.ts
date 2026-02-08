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

  async findMany(filter: FindEventsFilter, tenantId: string): Promise<events[]> {
    return this.repo.findMany(filter, tenantId);
  }

  // ✅ Compatibility alias (used by ProcessService)
  async listEventsByRelated(relatedTable: string, relatedId: string, tenantId: string): Promise<events[]> {
    return this.findMany(
      {
        related_table: relatedTable,
        related_id: relatedId,
      },
      tenantId
    );
  }

  async findById(id: string, tenantId: string): Promise<events> {
    const found = await this.repo.findById(id, tenantId);
    if (!found) throw new NotFoundException("Evento não encontrado.");
    return found;
  }

  async create(body: Prisma.eventsCreateInput, tenantId: string): Promise<events> {
    return this.repo.create(body, tenantId);
  }

  async patchById(id: string, body: Prisma.eventsUpdateManyMutationInput, tenantId: string): Promise<events> {
    await this.findById(id, tenantId);
    const updated = await this.repo.updateById(id, body, tenantId);
    if (!updated) throw new NotFoundException("Evento não encontrado.");
    return updated;
  }

  async deleteById(id: string, tenantId: string): Promise<{ ok: true }> {
    await this.findById(id, tenantId);

    const ok = await this.repo.deleteById(id, tenantId);
    if (!ok) throw new NotFoundException("Evento não encontrado.");

    return { ok: true };
  }
}
