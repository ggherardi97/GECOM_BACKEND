import { Controller, Post, Body, Get, Param, Patch, Delete } from '@nestjs/common';
import { TransportsService } from './transports.service';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

@ApiTags('transports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('transports')
export class TransportsController {
  constructor(private readonly transportsService: TransportsService) {}

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
