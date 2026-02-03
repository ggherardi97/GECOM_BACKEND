import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { TransportStatusesService } from "./transport-statuses.service";
import { CreateTransportStatusDto } from "./dto/create-transport-status.dto";
import { UpdateTransportStatusDto } from "./dto/update-transport-status.dto";

@Controller("transport-statuses")
export class TransportStatusesController {
  constructor(private readonly service: TransportStatusesService) {}

  // GET /transport-statuses
  @Get()
  public async list() {
    return this.service.list();
  }

  // GET /transport-statuses/:id
  @Get(":id")
  public async getById(@Param("id") id: string) {
    return this.service.getById(id);
  }

  // POST /transport-statuses
  @Post()
  public async create(@Body() dto: CreateTransportStatusDto) {
    return this.service.create(dto);
  }

  // PATCH /transport-statuses/:id
  @Patch(":id")
  public async update(@Param("id") id: string, @Body() dto: UpdateTransportStatusDto) {
    return this.service.update(id, dto);
  }

  // DELETE /transport-statuses/:id
  @Delete(":id")
  @HttpCode(204)
  public async delete(@Param("id") id: string) {
    await this.service.delete(id);
  }
}
