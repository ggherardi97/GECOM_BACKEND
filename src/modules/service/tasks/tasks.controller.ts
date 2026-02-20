import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { getTenantId, getUserId } from '../common/request-auth.util';
import { CreateTaskDto, CreateTaskTypeDto, UpdateTaskDto, UpdateTaskTypeDto } from './tasks.dto';
import { TasksService } from './tasks.service';

@UseGuards(JwtAuthGuard)
@Controller('service/tasks')
export class TasksController {
  constructor(private readonly service: TasksService) {}

  @Get('types/all')
  listTypes(@Req() req: any) {
    return this.service.listTaskTypes(getTenantId(req));
  }

  @Get('types/:id')
  getType(@Req() req: any, @Param('id') id: string) {
    return this.service.getTaskType(getTenantId(req), id);
  }

  @Post('types')
  createType(@Req() req: any, @Body() dto: CreateTaskTypeDto) {
    return this.service.createTaskType(getTenantId(req), dto);
  }

  @Patch('types/:id')
  updateType(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateTaskTypeDto) {
    return this.service.updateTaskType(getTenantId(req), id, dto);
  }

  @Delete('types/:id')
  removeType(@Req() req: any, @Param('id') id: string) {
    return this.service.removeTaskType(getTenantId(req), id);
  }

  @Get()
  listTasks(@Req() req: any) {
    return this.service.listTasks(getTenantId(req));
  }

  @Get(':id')
  getTask(@Req() req: any, @Param('id') id: string) {
    return this.service.getTask(getTenantId(req), id);
  }

  @Post()
  createTask(@Req() req: any, @Body() dto: CreateTaskDto) {
    return this.service.createTask(getTenantId(req), getUserId(req), dto);
  }

  @Patch(':id')
  updateTask(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateTaskDto) {
    return this.service.updateTask(getTenantId(req), id, dto);
  }

  @Delete(':id')
  removeTask(@Req() req: any, @Param('id') id: string) {
    return this.service.removeTask(getTenantId(req), id);
  }
}
