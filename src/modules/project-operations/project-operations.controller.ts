import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  CreatePoChecklistDto,
  CreatePoChecklistItemDto,
  CreatePoDeliverableDto,
  CreatePoMilestoneDto,
  CreatePoProjectDto,
  CreatePoProjectProcessDto,
  CreatePoResourceRoleDto,
  CreatePoStatusDto,
  CreatePoWorkOrderAppointmentDto,
  CreatePoWorkOrderAssignmentDto,
  CreatePoWorkOrderDto,
  GeneratePoWorkOrderAppointmentsDto,
  MovePoChecklistItemDto,
  SetupPoDefaultsDto,
  UpdatePoChecklistDto,
  UpdatePoChecklistItemDto,
  UpdatePoDeliverableDto,
  UpdatePoMilestoneDto,
  UpdatePoProjectDto,
  UpdatePoProjectProcessDto,
  UpdatePoResourceRoleDto,
  UpdatePoStatusDto,
  UpdatePoWorkOrderAppointmentDto,
  UpdatePoWorkOrderAssignmentDto,
  UpdatePoWorkOrderDto,
} from './dto/project-operations.dto';
import { ProjectOperationsService } from './project-operations.service';

type AuthUser = {
  id: string;
  tenant_id: string;
  role?: string;
};

@ApiTags('project-operations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('project-operations')
export class ProjectOperationsController {
  constructor(private readonly service: ProjectOperationsService) {}

  private getUser(req: Request): AuthUser {
    const user = ((req as any)?.user ?? {}) as any;
    const id = String(user.id ?? user.user_id ?? user.userId ?? user.sub ?? '').trim();
    const tenantId = String(user.tenant_id ?? user.tenantId ?? '').trim();
    const role = String(user.role ?? '').trim();

    if (!id || !tenantId) {
      throw new UnauthorizedException('Authentication context missing: req.user.id / req.user.tenant_id');
    }

    return { id, tenant_id: tenantId, role };
  }

  @Get('project-statuses')
  listProjectStatuses(@Req() req: Request, @Query() query: any) {
    return this.service.listResource(this.getUser(req), 'project-statuses', query || {});
  }

  @Get('project-statuses/:id')
  findProjectStatusById(@Req() req: Request, @Param('id') id: string) {
    return this.service.findResourceById(this.getUser(req), 'project-statuses', id);
  }

  @Post('project-statuses')
  createProjectStatus(@Req() req: Request, @Body() dto: CreatePoStatusDto) {
    return this.service.createResource(this.getUser(req), 'project-statuses', dto as any);
  }

  @Patch('project-statuses/:id')
  updateProjectStatus(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdatePoStatusDto) {
    return this.service.updateResource(this.getUser(req), 'project-statuses', id, dto as any);
  }

  @Delete('project-statuses/:id')
  removeProjectStatus(@Req() req: Request, @Param('id') id: string) {
    return this.service.removeResource(this.getUser(req), 'project-statuses', id);
  }

  @Get('deliverable-statuses')
  listDeliverableStatuses(@Req() req: Request, @Query() query: any) {
    return this.service.listResource(this.getUser(req), 'deliverable-statuses', query || {});
  }

  @Get('deliverable-statuses/:id')
  findDeliverableStatusById(@Req() req: Request, @Param('id') id: string) {
    return this.service.findResourceById(this.getUser(req), 'deliverable-statuses', id);
  }

  @Post('deliverable-statuses')
  createDeliverableStatus(@Req() req: Request, @Body() dto: CreatePoStatusDto) {
    return this.service.createResource(this.getUser(req), 'deliverable-statuses', dto as any);
  }

  @Patch('deliverable-statuses/:id')
  updateDeliverableStatus(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdatePoStatusDto) {
    return this.service.updateResource(this.getUser(req), 'deliverable-statuses', id, dto as any);
  }

  @Delete('deliverable-statuses/:id')
  removeDeliverableStatus(@Req() req: Request, @Param('id') id: string) {
    return this.service.removeResource(this.getUser(req), 'deliverable-statuses', id);
  }

  @Get('work-order-statuses')
  listWorkOrderStatuses(@Req() req: Request, @Query() query: any) {
    return this.service.listResource(this.getUser(req), 'work-order-statuses', query || {});
  }

  @Get('work-order-statuses/:id')
  findWorkOrderStatusById(@Req() req: Request, @Param('id') id: string) {
    return this.service.findResourceById(this.getUser(req), 'work-order-statuses', id);
  }

  @Post('work-order-statuses')
  createWorkOrderStatus(@Req() req: Request, @Body() dto: CreatePoStatusDto) {
    return this.service.createResource(this.getUser(req), 'work-order-statuses', dto as any);
  }

  @Patch('work-order-statuses/:id')
  updateWorkOrderStatus(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdatePoStatusDto) {
    return this.service.updateResource(this.getUser(req), 'work-order-statuses', id, dto as any);
  }

  @Delete('work-order-statuses/:id')
  removeWorkOrderStatus(@Req() req: Request, @Param('id') id: string) {
    return this.service.removeResource(this.getUser(req), 'work-order-statuses', id);
  }

  @Get('resource-roles')
  listResourceRoles(@Req() req: Request, @Query() query: any) {
    return this.service.listResource(this.getUser(req), 'resource-roles', query || {});
  }

  @Get('resource-roles/:id')
  findResourceRoleById(@Req() req: Request, @Param('id') id: string) {
    return this.service.findResourceById(this.getUser(req), 'resource-roles', id);
  }

  @Post('resource-roles')
  createResourceRole(@Req() req: Request, @Body() dto: CreatePoResourceRoleDto) {
    return this.service.createResource(this.getUser(req), 'resource-roles', dto as any);
  }

  @Patch('resource-roles/:id')
  updateResourceRole(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdatePoResourceRoleDto) {
    return this.service.updateResource(this.getUser(req), 'resource-roles', id, dto as any);
  }

  @Delete('resource-roles/:id')
  removeResourceRole(@Req() req: Request, @Param('id') id: string) {
    return this.service.removeResource(this.getUser(req), 'resource-roles', id);
  }

  @Get('projects')
  listProjects(@Req() req: Request, @Query() query: any) {
    return this.service.listResource(this.getUser(req), 'projects', query || {});
  }

  @Get('projects/:id')
  findProjectById(@Req() req: Request, @Param('id') id: string) {
    return this.service.findResourceById(this.getUser(req), 'projects', id);
  }

  @Post('projects')
  createProject(@Req() req: Request, @Body() dto: CreatePoProjectDto) {
    return this.service.createResource(this.getUser(req), 'projects', dto as any);
  }

  @Patch('projects/:id')
  updateProject(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdatePoProjectDto) {
    return this.service.updateResource(this.getUser(req), 'projects', id, dto as any);
  }

  @Delete('projects/:id')
  removeProject(@Req() req: Request, @Param('id') id: string) {
    return this.service.removeResource(this.getUser(req), 'projects', id);
  }

  @Get('project-processes')
  listProjectProcesses(@Req() req: Request, @Query() query: any) {
    return this.service.listResource(this.getUser(req), 'project-processes', query || {});
  }

  @Get('project-processes/:id')
  findProjectProcessById(@Req() req: Request, @Param('id') id: string) {
    return this.service.findResourceById(this.getUser(req), 'project-processes', id);
  }

  @Post('project-processes')
  createProjectProcess(@Req() req: Request, @Body() dto: CreatePoProjectProcessDto) {
    return this.service.createResource(this.getUser(req), 'project-processes', dto as any);
  }

  @Patch('project-processes/:id')
  updateProjectProcess(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdatePoProjectProcessDto) {
    return this.service.updateResource(this.getUser(req), 'project-processes', id, dto as any);
  }

  @Delete('project-processes/:id')
  removeProjectProcess(@Req() req: Request, @Param('id') id: string) {
    return this.service.removeResource(this.getUser(req), 'project-processes', id);
  }

  @Get('projects/:id/processes')
  listProjectProcessesByProject(@Req() req: Request, @Param('id') projectId: string, @Query() query: any) {
    return this.service.listResource(this.getUser(req), 'project-processes', {
      ...(query || {}),
      project_id: projectId,
    });
  }

  @Post('projects/:id/processes')
  createProjectProcessByProject(
    @Req() req: Request,
    @Param('id') projectId: string,
    @Body() dto: CreatePoProjectProcessDto,
  ) {
    return this.service.createResource(this.getUser(req), 'project-processes', {
      ...dto,
      project_id: projectId,
    });
  }

  @Get('milestones')
  listMilestones(@Req() req: Request, @Query() query: any) {
    return this.service.listResource(this.getUser(req), 'milestones', query || {});
  }

  @Get('milestones/:id')
  findMilestoneById(@Req() req: Request, @Param('id') id: string) {
    return this.service.findResourceById(this.getUser(req), 'milestones', id);
  }

  @Post('milestones')
  createMilestone(@Req() req: Request, @Body() dto: CreatePoMilestoneDto) {
    return this.service.createResource(this.getUser(req), 'milestones', dto as any);
  }

  @Patch('milestones/:id')
  updateMilestone(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdatePoMilestoneDto) {
    return this.service.updateResource(this.getUser(req), 'milestones', id, dto as any);
  }

  @Delete('milestones/:id')
  removeMilestone(@Req() req: Request, @Param('id') id: string) {
    return this.service.removeResource(this.getUser(req), 'milestones', id);
  }

  @Get('deliverables')
  listDeliverables(@Req() req: Request, @Query() query: any) {
    return this.service.listResource(this.getUser(req), 'deliverables', query || {});
  }

  @Get('deliverables/:id')
  findDeliverableById(@Req() req: Request, @Param('id') id: string) {
    return this.service.findResourceById(this.getUser(req), 'deliverables', id);
  }

  @Post('deliverables')
  createDeliverable(@Req() req: Request, @Body() dto: CreatePoDeliverableDto) {
    return this.service.createResource(this.getUser(req), 'deliverables', dto as any);
  }

  @Patch('deliverables/:id')
  updateDeliverable(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdatePoDeliverableDto) {
    return this.service.updateResource(this.getUser(req), 'deliverables', id, dto as any);
  }

  @Delete('deliverables/:id')
  removeDeliverable(@Req() req: Request, @Param('id') id: string) {
    return this.service.removeResource(this.getUser(req), 'deliverables', id);
  }

  @Get('checklists')
  listChecklists(@Req() req: Request, @Query() query: any) {
    return this.service.listResource(this.getUser(req), 'checklists', query || {});
  }

  @Get('checklists/:id')
  findChecklistById(@Req() req: Request, @Param('id') id: string) {
    return this.service.findResourceById(this.getUser(req), 'checklists', id);
  }

  @Post('checklists')
  createChecklist(@Req() req: Request, @Body() dto: CreatePoChecklistDto) {
    return this.service.createResource(this.getUser(req), 'checklists', dto as any);
  }

  @Patch('checklists/:id')
  updateChecklist(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdatePoChecklistDto) {
    return this.service.updateResource(this.getUser(req), 'checklists', id, dto as any);
  }

  @Delete('checklists/:id')
  removeChecklist(@Req() req: Request, @Param('id') id: string) {
    return this.service.removeResource(this.getUser(req), 'checklists', id);
  }

  @Get('checklist-items')
  listChecklistItems(@Req() req: Request, @Query() query: any) {
    return this.service.listResource(this.getUser(req), 'checklist-items', query || {});
  }

  @Get('checklist-items/:id')
  findChecklistItemById(@Req() req: Request, @Param('id') id: string) {
    return this.service.findResourceById(this.getUser(req), 'checklist-items', id);
  }

  @Post('checklist-items')
  createChecklistItem(@Req() req: Request, @Body() dto: CreatePoChecklistItemDto) {
    return this.service.createChecklistItem(this.getUser(req), dto);
  }

  @Patch('checklist-items/:id')
  updateChecklistItem(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdatePoChecklistItemDto) {
    return this.service.updateResource(this.getUser(req), 'checklist-items', id, dto as any);
  }

  @Patch('checklist-items/:id/move')
  moveChecklistItem(@Req() req: Request, @Param('id') id: string, @Body() dto: MovePoChecklistItemDto) {
    return this.service.updateChecklistItemMove(this.getUser(req), id, dto);
  }

  @Delete('checklist-items/:id')
  removeChecklistItem(@Req() req: Request, @Param('id') id: string) {
    return this.service.removeResource(this.getUser(req), 'checklist-items', id);
  }

  @Get('work-orders')
  listWorkOrders(@Req() req: Request, @Query() query: any) {
    return this.service.listResource(this.getUser(req), 'work-orders', query || {});
  }

  @Get('work-orders/:id')
  findWorkOrderById(@Req() req: Request, @Param('id') id: string) {
    return this.service.findResourceById(this.getUser(req), 'work-orders', id);
  }

  @Post('work-orders')
  createWorkOrder(@Req() req: Request, @Body() dto: CreatePoWorkOrderDto) {
    return this.service.createWorkOrder(this.getUser(req), dto);
  }

  @Patch('work-orders/:id')
  updateWorkOrder(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdatePoWorkOrderDto) {
    return this.service.updateResource(this.getUser(req), 'work-orders', id, dto as any);
  }

  @Delete('work-orders/:id')
  removeWorkOrder(@Req() req: Request, @Param('id') id: string) {
    return this.service.removeResource(this.getUser(req), 'work-orders', id);
  }

  @Get('work-orders/:id/assignments')
  listWorkOrderAssignments(@Req() req: Request, @Param('id') workOrderId: string, @Query() query: any) {
    return this.service.listWorkOrderAssignments(this.getUser(req), workOrderId, query || {});
  }

  @Post('work-orders/:id/assignments')
  createWorkOrderAssignment(
    @Req() req: Request,
    @Param('id') workOrderId: string,
    @Body() dto: CreatePoWorkOrderAssignmentDto,
  ) {
    return this.service.createWorkOrderAssignment(this.getUser(req), workOrderId, dto as any);
  }

  @Get('work-order-assignments')
  listWorkOrderAssignmentsGlobal(@Req() req: Request, @Query() query: any) {
    return this.service.listResource(this.getUser(req), 'work-order-assignments', query || {});
  }

  @Get('work-order-assignments/:id')
  findWorkOrderAssignmentById(@Req() req: Request, @Param('id') id: string) {
    return this.service.findResourceById(this.getUser(req), 'work-order-assignments', id);
  }

  @Patch('work-order-assignments/:id')
  updateWorkOrderAssignment(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdatePoWorkOrderAssignmentDto,
  ) {
    return this.service.updateResource(this.getUser(req), 'work-order-assignments', id, dto as any);
  }

  @Delete('work-order-assignments/:id')
  removeWorkOrderAssignment(@Req() req: Request, @Param('id') id: string) {
    return this.service.removeResource(this.getUser(req), 'work-order-assignments', id);
  }

  @Get('work-orders/:id/appointments')
  listWorkOrderAppointments(@Req() req: Request, @Param('id') workOrderId: string, @Query() query: any) {
    return this.service.listWorkOrderAppointments(this.getUser(req), workOrderId, query || {});
  }

  @Post('work-orders/:id/appointments')
  createWorkOrderAppointment(
    @Req() req: Request,
    @Param('id') workOrderId: string,
    @Body() dto: CreatePoWorkOrderAppointmentDto,
  ) {
    return this.service.createWorkOrderAppointment(this.getUser(req), workOrderId, dto as any);
  }

  @Post('work-orders/:id/generate-appointments')
  generateWorkOrderAppointments(
    @Req() req: Request,
    @Param('id') workOrderId: string,
    @Body() dto: GeneratePoWorkOrderAppointmentsDto,
  ) {
    return this.service.generateAppointmentsFromWorkOrder(this.getUser(req), workOrderId, dto);
  }

  @Get('work-order-appointments')
  listWorkOrderAppointmentsGlobal(@Req() req: Request, @Query() query: any) {
    return this.service.listResource(this.getUser(req), 'work-order-appointments', query || {});
  }

  @Get('work-order-appointments/:id')
  findWorkOrderAppointmentById(@Req() req: Request, @Param('id') id: string) {
    return this.service.findResourceById(this.getUser(req), 'work-order-appointments', id);
  }

  @Patch('work-order-appointments/:id')
  updateWorkOrderAppointment(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdatePoWorkOrderAppointmentDto,
  ) {
    return this.service.updateResource(this.getUser(req), 'work-order-appointments', id, dto as any);
  }

  @Delete('work-order-appointments/:id')
  removeWorkOrderAppointment(@Req() req: Request, @Param('id') id: string) {
    return this.service.removeResource(this.getUser(req), 'work-order-appointments', id);
  }

  @Post('setup-defaults')
  setupDefaults(@Req() req: Request, @Body() dto: SetupPoDefaultsDto) {
    return this.service.setupDefaults(this.getUser(req), dto || {});
  }
}
