import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { getTenantId } from '../common/request-auth.util';
import { CreateQueueDto, CreateQueueMemberDto, UpdateQueueDto, UpdateQueueMemberDto } from './queues.dto';
import { QueuesService } from './queues.service';

@UseGuards(JwtAuthGuard)
@Controller('service/queues')
export class QueuesController {
  constructor(private readonly service: QueuesService) {}

  @Get()
  listQueues(@Req() req: any) {
    return this.service.listQueues(getTenantId(req));
  }

  @Post()
  createQueue(@Req() req: any, @Body() dto: CreateQueueDto) {
    return this.service.createQueue(getTenantId(req), dto);
  }

  @Get('members')
  listMembers(@Req() req: any) {
    return this.service.listMembers(getTenantId(req));
  }

  @Get('members/:id')
  getMember(@Req() req: any, @Param('id') id: string) {
    return this.service.getMember(getTenantId(req), id);
  }

  @Post('members')
  createMember(@Req() req: any, @Body() dto: CreateQueueMemberDto) {
    return this.service.createMember(getTenantId(req), dto);
  }

  @Patch('members/:id')
  updateMember(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateQueueMemberDto) {
    return this.service.updateMember(getTenantId(req), id, dto);
  }

  @Delete('members/:id')
  removeMember(@Req() req: any, @Param('id') id: string) {
    return this.service.removeMember(getTenantId(req), id);
  }

  @Get(':id')
  getQueue(@Req() req: any, @Param('id') id: string) {
    return this.service.getQueue(getTenantId(req), id);
  }

  @Patch(':id')
  updateQueue(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateQueueDto) {
    return this.service.updateQueue(getTenantId(req), id, dto);
  }

  @Delete(':id')
  removeQueue(@Req() req: any, @Param('id') id: string) {
    return this.service.removeQueue(getTenantId(req), id);
  }
}
