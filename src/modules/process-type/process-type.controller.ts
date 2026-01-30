import { Controller, Post, Body, Get, Param, Put, Delete } from '@nestjs/common';
import { ProcessTypeService } from './process-type.service';
import { CreateProcessTypeDTO } from './dto/create-process-type.dto';
import { UpdateProcessTypeDTO } from './dto/update-process-type.dto';
import { process_types } from '@prisma/client';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

@ApiTags('process-types')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('process-types')
export class ProcessTypeController {
  constructor(private readonly service: ProcessTypeService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a new process type',
    description: 'Creates a new process type',
  })
  @ApiBody({ type: CreateProcessTypeDTO })
  @ApiCreatedResponse({ description: 'Process type successfully created' })
  async create(@Body() data: CreateProcessTypeDTO): Promise<process_types> {
    return await this.service.create(data);
  }

  @Get()
  @ApiOperation({
    summary: 'List all process types',
    description: 'Returns a list of all process types',
  })
  @ApiOkResponse({ description: 'List of process types' })
  async findAll(): Promise<process_types[]> {
    return await this.service.findAll();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get process type by ID',
    description: 'Returns a specific process type by its ID',
  })
  @ApiParam({
    name: 'id',
    description: 'Process type ID',
    example: 'a1b2c3d4-5e6f-7g8h-9i0j-k1l2m3n4o5p6',
  })
  @ApiOkResponse({ description: 'Process type found' })
  async findById(@Param('id') id: string): Promise<process_types | null> {
    return await this.service.findById(id);
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Update process type',
    description: 'Updates a specific process type by its ID',
  })
  @ApiParam({
    name: 'id',
    description: 'Process type ID',
    example: 'a1b2c3d4-5e6f-7g8h-9i0j-k1l2m3n4o5p6',
  })
  @ApiBody({ type: UpdateProcessTypeDTO })
  @ApiOkResponse({ description: 'Process type updated' })
  async update(
    @Param('id') id: string,
    @Body() data: UpdateProcessTypeDTO
  ): Promise<process_types> {
    return await this.service.update(id, data);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete process type',
    description: 'Deletes a specific process type by its ID',
  })
  @ApiParam({
    name: 'id',
    description: 'Process type ID',
    example: 'a1b2c3d4-5e6f-7g8h-9i0j-k1l2m3n4o5p6',
  })
  @ApiOkResponse({ description: 'Process type deleted' })
  async delete(@Param('id') id: string): Promise<process_types> {
    return await this.service.delete(id);
  }
}
