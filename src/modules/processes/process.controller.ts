import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Patch,
  Delete,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ProcessService } from './process.service';
import { CreateProcessDTO } from './dto/create-process.dto';
import { UpdateProcessStatusDTO } from './dto/update-process-status.dto';
import { processes } from '@prisma/client';

@ApiTags('processes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('processes')
export class ProcessController {
  constructor(private readonly service: ProcessService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a new process',
    description: 'Creates a new process and logs a system event',
  })
  @ApiBody({ type: CreateProcessDTO })
  @ApiCreatedResponse({ description: 'Process successfully created' })
  async create(@Body() data: CreateProcessDTO): Promise<processes> {
    return this.service.create(data);
  }

  @Get()
  @ApiOperation({
    summary: 'List all processes',
    description: 'Returns a list of all active processes',
  })
  @ApiOkResponse({ description: 'List of processes' })
  async findAll(): Promise<processes[]> {
    return this.service.findAll();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get process by ID',
    description: 'Returns a specific process by its ID',
  })
  @ApiParam({
    name: 'id',
    description: 'Process ID',
    example: 'a1b2c3d4-5e6f-7g8h-9i0j-k1l2m3n4o5p6',
  })
  @ApiOkResponse({ description: 'Process found' })
  async findById(@Param('id') id: string): Promise<processes> {
    return this.service.findById(id);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Update process status',
    description: 'Updates the status of a process and creates a status change event',
  })
  @ApiParam({
    name: 'id',
    description: 'Process ID',
    example: 'a1b2c3d4-5e6f-7g8h-9i0j-k1l2m3n4o5p6',
  })
  @ApiBody({ type: UpdateProcessStatusDTO })
  @ApiOkResponse({ description: 'Process status updated' })
  async updateStatus(
    @Param('id') id: string,
    @Body() data: UpdateProcessStatusDTO,
  ): Promise<processes> {
    return this.service.updateStatus(id, data.status);
  }

  @Get(':id/events')
  @ApiOperation({
    summary: 'Get process events',
    description: 'Returns all events related to a specific process',
  })
  @ApiParam({
    name: 'id',
    description: 'Process ID',
    example: 'a1b2c3d4-5e6f-7g8h-9i0j-k1l2m3n4o5p6',
  })
  @ApiOkResponse({ description: 'List of process events' })
  async getProcessEvents(@Param('id') id: string) {
    return this.service.getProcessEvents(id);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a process',
    description: 'Soft deletes a process and creates a deletion event',
  })
  @ApiParam({
    name: 'id',
    description: 'Process ID',
    example: 'a1b2c3d4-5e6f-7g8h-9i0j-k1l2m3n4o5p6',
  })
  @ApiOkResponse({ description: 'Process deleted' })
  async remove(@Param('id') id: string): Promise<processes> {
    return this.service.softDelete(id);
  }
}
