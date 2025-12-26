import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOkResponse,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { EventService } from './event.service';
import { events } from '@prisma/client';

@ApiTags('events')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('events')
export class EventController {
  constructor(private readonly service: EventService) {}

  @Get('related')
  @ApiOperation({
    summary: 'List events by related entity',
    description: 'Returns all events for a specific related table and ID',
  })
  @ApiQuery({
    name: 'related_table',
    description: 'Table name',
    example: 'processes',
  })
  @ApiQuery({
    name: 'related_id',
    description: 'Related record ID',
    example: 'a1b2c3d4-5e6f-7g8h-9i0j-k1l2m3n4o5p6',
  })
  @ApiOkResponse({ description: 'List of events' })
  async listByRelated(
    @Query('related_table') relatedTable: string,
    @Query('related_id') relatedId: string,
  ): Promise<events[]> {
    return this.service.listEventsByRelated(relatedTable, relatedId);
  }

  @Get('type/:type')
  @ApiOperation({
    summary: 'List events by type',
    description: 'Returns all events of a specific type',
  })
  @ApiParam({
    name: 'type',
    description: 'Event type',
    example: 1,
  })
  @ApiOkResponse({ description: 'List of events' })
  async listByType(@Param('type') type: string): Promise<events[]> {
    return this.service.findByType(parseInt(type, 10));
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get event by ID',
    description: 'Returns a specific event by its ID',
  })
  @ApiParam({
    name: 'id',
    description: 'Event ID',
    example: 'a1b2c3d4-5e6f-7g8h-9i0j-k1l2m3n4o5p6',
  })
  @ApiOkResponse({ description: 'Event found' })
  async findById(@Param('id') id: string): Promise<events> {
    return this.service.findById(id);
  }
}
