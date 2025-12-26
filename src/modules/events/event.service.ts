import { Injectable, NotFoundException } from '@nestjs/common';
import { EventRepository } from './event.repository';
import { CreateEventDTO } from './dto/create-event.dto';
import { events } from '@prisma/client';

@Injectable()
export class EventService {
  constructor(private readonly repository: EventRepository) {}

  async create(data: CreateEventDTO): Promise<events> {
    return await this.repository.create(data);
  }

  async listEventsByRelated(relatedTable: string, relatedId: string): Promise<events[]> {
    return await this.repository.findByRelated(relatedTable, relatedId);
  }

  async findById(id: string): Promise<events> {
    const event = await this.repository.findById(id);
    if (!event) {
      throw new NotFoundException(`Event with ID ${id} not found`);
    }
    return event;
  }

  async findByType(type: number): Promise<events[]> {
    return await this.repository.findByType(type);
  }

  async markAsFinished(id: string): Promise<events> {
    await this.findById(id);
    return await this.repository.updateFinished(id, true);
  }
}
