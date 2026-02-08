import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  Req,
  BadRequestException,
} from "@nestjs/common";
import type { Request } from "express";
import { Prisma } from "@prisma/client";
import { EventService } from "./event.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

@ApiTags("events")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("events")
export class EventController {
  constructor(private readonly service: EventService) {}

  private getTenantId(req: Request): string {
    const tenantId = String((req as any)?.user?.tenant_id ?? (req as any)?.user?.tenantId ?? "").trim();
    if (!tenantId) throw new BadRequestException("tenant_id is missing from authenticated user.");
    return tenantId;
  }

  // GET /events?type=1&related_table=processes&related_id=uuid
  // GET /events?process_id=uuid
  // GET /events?client_id=uuid
  @Get()
  async getMany(
    @Req() req: Request,
    @Query("type") type?: string,
    @Query("related_table") related_table?: string,
    @Query("related_id") related_id?: string,
    @Query("process_id") process_id?: string,
    @Query("client_id") client_id?: string
  ) {
    const tenantId = this.getTenantId(req);

    const parsedType = type != null && String(type).trim() !== "" ? Number(type) : undefined;

    return this.service.findMany(
      {
        type: Number.isFinite(parsedType) ? parsedType : undefined,
        related_table,
        related_id,
        process_id,
        client_id,
      },
      tenantId
    );
  }

  // GET /events/:id
  @Get(":id")
  async getById(@Req() req: Request, @Param("id") id: string) {
    const tenantId = this.getTenantId(req);
    return this.service.findById(id, tenantId);
  }

  // POST /events
  @Post()
  async create(@Req() req: Request, @Body() body: Prisma.eventsCreateInput) {
    const tenantId = this.getTenantId(req);
    return this.service.create(body, tenantId);
  }

  // PATCH /events/:id
  @Patch(":id")
  async patch(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: Prisma.eventsUpdateManyMutationInput
  ) {
    const tenantId = this.getTenantId(req);
    return this.service.patchById(id, body, tenantId);
  }

  // DELETE /events/:id
  @Delete(":id")
  async delete(@Req() req: Request, @Param("id") id: string) {
    const tenantId = this.getTenantId(req);
    return this.service.deleteById(id, tenantId);
  }
}
