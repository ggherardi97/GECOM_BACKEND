import { Controller, Post, Body, Get, Param, Patch, Delete, Query, UseGuards } from '@nestjs/common';
import { TransportsService } from './transports.service';
import { Prisma } from '@prisma/client';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

@ApiTags('transports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('transports')
export class TransportsController {
  constructor(private readonly transportsService: TransportsService) {}

  // GET /transports?process_id=...&transport_type_id=...&transport_status_id=...
  @Get()
  @ApiOperation({
    summary: 'List transports',
    description: 'Returns a list of transports. Supports filters via querystring.',
  })
  @ApiOkResponse({ description: 'List of transports' })
  async findMany(
    @Query('process_id') process_id?: string,
    @Query('transport_type_id') transport_type_id?: string,
    @Query('transport_status_id') transport_status_id?: string,
  ) {
    return this.transportsService.findMany({ process_id, transport_type_id, transport_status_id });
  }

  // GET /transports/:id
  @Get(':id')
  @ApiOperation({ summary: 'Get transport by ID' })
  @ApiOkResponse({ description: 'Transport' })
  async findById(@Param('id') id: string) {
    return this.transportsService.findById(id);
  }

  // POST /transports
  @Post()
  @ApiOperation({ summary: 'Create transport' })
  async create(@Body() body: Prisma.transportsCreateInput) {
    return this.transportsService.create(body);
  }

  // PATCH /transports/:id
  @Patch(':id')
  @ApiOperation({ summary: 'Update transport by ID' })
  async patch(@Param('id') id: string, @Body() body: Prisma.transportsUpdateInput) {
    return this.transportsService.patchById(id, body);
  }

  // DELETE /transports/:id
  @Delete(':id')
  @ApiOperation({ summary: 'Delete transport by ID' })
  async delete(@Param('id') id: string) {
    return this.transportsService.deleteById(id);
  }

  // GET /transports/types
  @Get('types')
  @ApiOperation({
    summary: 'List all transports types',
    description: 'Returns a list of all transports types',
  })
  @ApiOkResponse({ description: 'List of transports types' })
  async findAllTransportTypes() {
    return this.transportsService.findAllTransportTypes();
  }
}
