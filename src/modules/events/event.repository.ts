import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEventDTO } from './dto/create-event.dto';
import { events } from '@prisma/client';

@Injectable()
export class EventRepository {
  private logger = new Logger(EventRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateEventDTO): Promise<events> {
    try {
      return await this.prisma.events.create({
        data: {
          related_table: data.related_table,
          related_id: data.related_id,
          status: data.status,
          title: data.title,
          description: data.description,
          type: data.type,
          start_time: new Date(data.start_time),
          end_time: data.end_time ? new Date(data.end_time) : null,
          finished: data.finished ?? false,
          document_related: data.document_related ?? false,
        },
      });
    } catch (error) {
      this.logger.error('Error creating event:', error);
      throw error;
    }
  }

  async findByRelated(relatedTable: string, relatedId: string): Promise<events[]> {
    return await this.prisma.events.findMany({
      where: {
        related_table: relatedTable,
        related_id: relatedId,
      },
      orderBy: {
        created_at: 'desc',
      },
    });
  }

  async findById(id: string): Promise<events | null> {
    return await this.prisma.events.findUnique({
      where: { id },
    });
  }

  async findByType(type: number): Promise<events[]> {
    return await this.prisma.events.findMany({
      where: { type },
      orderBy: {
        created_at: 'desc',
      },
    });
  }

  async updateFinished(id: string, finished: boolean): Promise<events> {
    return await this.prisma.events.update({
      where: { id },
      data: { finished },
    });
  }
}
