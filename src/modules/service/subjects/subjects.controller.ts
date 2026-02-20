import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { getTenantId } from '../common/request-auth.util';
import { CreateSubjectDto, UpdateSubjectDto } from './subjects.dto';
import { SubjectsService } from './subjects.service';

@UseGuards(JwtAuthGuard)
@Controller('service/subjects')
export class SubjectsController {
  constructor(private readonly service: SubjectsService) {}

  @Get()
  list(@Req() req: any) {
    return this.service.list(getTenantId(req));
  }

  @Get(':id')
  getById(@Req() req: any, @Param('id') id: string) {
    return this.service.getById(getTenantId(req), id);
  }

  @Post()
  create(@Req() req: any, @Body() dto: CreateSubjectDto) {
    return this.service.create(getTenantId(req), dto);
  }

  @Patch(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateSubjectDto) {
    return this.service.update(getTenantId(req), id, dto);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.service.remove(getTenantId(req), id);
  }
}
