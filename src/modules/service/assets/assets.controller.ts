import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { getTenantId } from '../common/request-auth.util';
import { CreateAssetDto, UpdateAssetDto } from './assets.dto';
import { AssetsService } from './assets.service';

@UseGuards(JwtAuthGuard)
@Controller('service/assets')
export class AssetsController {
  constructor(private readonly service: AssetsService) {}

  @Get()
  list(@Req() req: any) {
    return this.service.list(getTenantId(req));
  }

  @Get(':id')
  getById(@Req() req: any, @Param('id') id: string) {
    return this.service.getById(getTenantId(req), id);
  }

  @Post()
  create(@Req() req: any, @Body() dto: CreateAssetDto) {
    return this.service.create(getTenantId(req), dto);
  }

  @Patch(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateAssetDto) {
    return this.service.update(getTenantId(req), id, dto);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.service.remove(getTenantId(req), id);
  }
}
