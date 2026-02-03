import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { EventService } from "./event.service";

@Controller("events")
export class EventController {
  constructor(private readonly service: EventService) {}

  // GET /events?type=1&related_table=processes&related_id=uuid
  // GET /events?process_id=uuid
  // GET /events?client_id=uuid
  @Get()
  async getMany(
    @Query("type") type?: string,
    @Query("related_table") related_table?: string,
    @Query("related_id") related_id?: string,
    @Query("process_id") process_id?: string,
    @Query("client_id") client_id?: string
  ) {
    const parsedType = type != null && String(type).trim() !== "" ? Number(type) : undefined;

    return this.service.findMany({
      type: Number.isFinite(parsedType) ? parsedType : undefined,
      related_table,
      related_id,
      process_id,
      client_id,
    });
  }

  // GET /events/:id
  @Get(":id")
  async getById(@Param("id") id: string) {
    return this.service.findById(id);
  }

  // POST /events
  @Post()
  async create(@Body() body: Prisma.eventsCreateInput) {
    return this.service.create(body);
  }

  // PATCH /events/:id
  @Patch(":id")
  async patch(@Param("id") id: string, @Body() body: Prisma.eventsUpdateInput) {
    return this.service.patchById(id, body);
  }

  // DELETE /events/:id
  @Delete(":id")
  async delete(@Param("id") id: string) {
    return this.service.deleteById(id);
  }
}