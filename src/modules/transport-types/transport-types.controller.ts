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
import { TransportTypesService } from "./transport-types.service";
import { CreateTransportTypeDto } from "./dto/create-transport-type.dto";
import { UpdateTransportTypeDto } from "./dto/update-transport-type.dto";

@Controller("transport-types")
export class TransportTypesController {
  constructor(private readonly service: TransportTypesService) {}

  // GET /transport-types
  @Get()
  public async list() {
    return this.service.list();
  }

  // GET /transport-types/:id
  @Get(":id")
  public async getById(@Param("id") id: string) {
    return this.service.getById(id);
  }

  // POST /transport-types
  @Post()
  public async create(@Body() dto: CreateTransportTypeDto) {
    return this.service.create(dto);
  }

  // PATCH /transport-types/:id
  @Patch(":id")
  public async update(@Param("id") id: string, @Body() dto: UpdateTransportTypeDto) {
    return this.service.update(id, dto);
  }

  // DELETE /transport-types/:id
  @Delete(":id")
  @HttpCode(204)
  public async delete(@Param("id") id: string) {
    await this.service.delete(id);
  }
}