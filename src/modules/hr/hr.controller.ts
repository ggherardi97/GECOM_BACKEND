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
import { HrService } from './hr.service';
import {
  CreateHrCertificationDto,
  CreateHrDepartmentAssignmentDto,
  CreateHrDepartmentDto,
  CreateHrDocumentTypeDto,
  CreateHrEmployeeCertificationDto,
  CreateHrEmployeeDto,
  CreateHrEmployeeLifecycleDto,
  CreateHrEmployeeLifecycleTaskDto,
  CreateHrEmployeeScheduleAssignmentDto,
  CreateHrEmployeeSkillDto,
  CreateHrEmploymentStatusDto,
  CreateHrLeaveRequestDto,
  CreateHrLeaveTypeDto,
  CreateHrLifecycleStageDto,
  CreateHrLifecycleTaskDto,
  CreateHrLifecycleTemplateDto,
  CreateHrMaritalStatusDto,
  CreateHrPositionDto,
  CreateHrSkillCategoryDto,
  CreateHrSkillDto,
  CreateHrWorkLocationDto,
  CreateHrWorkScheduleDto,
  HrSetupDefaultsDto,
  MoveHrEmployeeLifecycleTaskDto,
  UpdateHrCertificationDto,
  UpdateHrDepartmentAssignmentDto,
  UpdateHrDepartmentDto,
  UpdateHrDocumentTypeDto,
  UpdateHrEmployeeCertificationDto,
  UpdateHrEmployeeDto,
  UpdateHrEmployeeLifecycleDto,
  UpdateHrEmployeeLifecycleTaskDto,
  UpdateHrEmployeeScheduleAssignmentDto,
  UpdateHrEmployeeSkillDto,
  UpdateHrEmploymentStatusDto,
  UpdateHrLeaveRequestDto,
  UpdateHrLeaveTypeDto,
  UpdateHrLifecycleStageDto,
  UpdateHrLifecycleTaskDto,
  UpdateHrLifecycleTemplateDto,
  UpdateHrMaritalStatusDto,
  UpdateHrPositionDto,
  UpdateHrSkillCategoryDto,
  UpdateHrSkillDto,
  UpdateHrWorkLocationDto,
  UpdateHrWorkScheduleDto,
} from './dto/hr.dto';

type AuthUser = {
  id: string;
  tenant_id: string;
  role?: string;
};

@ApiTags('hr')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('hr')
export class HrController {
  constructor(private readonly service: HrService) {}

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

  @Get('departments')
  listDepartments(@Req() req: Request, @Query() query: any) {
    return this.service.listDepartments(this.getUser(req), query || {});
  }

  @Get('departments/:id')
  findDepartmentById(@Req() req: Request, @Param('id') id: string) {
    return this.service.findDepartmentById(this.getUser(req), id);
  }

  @Post('departments')
  createDepartment(@Req() req: Request, @Body() dto: CreateHrDepartmentDto) {
    return this.service.createDepartment(this.getUser(req), dto);
  }

  @Patch('departments/:id')
  updateDepartment(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateHrDepartmentDto) {
    return this.service.updateDepartment(this.getUser(req), id, dto);
  }

  @Delete('departments/:id')
  removeDepartment(@Req() req: Request, @Param('id') id: string) {
    return this.service.removeDepartment(this.getUser(req), id);
  }

  @Get('positions')
  listPositions(@Req() req: Request, @Query() query: any) {
    return this.service.listPositions(this.getUser(req), query || {});
  }

  @Get('positions/:id')
  findPositionById(@Req() req: Request, @Param('id') id: string) {
    return this.service.findPositionById(this.getUser(req), id);
  }

  @Post('positions')
  createPosition(@Req() req: Request, @Body() dto: CreateHrPositionDto) {
    return this.service.createPosition(this.getUser(req), dto);
  }

  @Patch('positions/:id')
  updatePosition(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateHrPositionDto) {
    return this.service.updatePosition(this.getUser(req), id, dto);
  }

  @Delete('positions/:id')
  removePosition(@Req() req: Request, @Param('id') id: string) {
    return this.service.removePosition(this.getUser(req), id);
  }

  @Get('work-locations')
  listWorkLocations(@Req() req: Request, @Query() query: any) {
    return this.service.listWorkLocations(this.getUser(req), query || {});
  }

  @Get('work-locations/:id')
  findWorkLocationById(@Req() req: Request, @Param('id') id: string) {
    return this.service.findWorkLocationById(this.getUser(req), id);
  }

  @Post('work-locations')
  createWorkLocation(@Req() req: Request, @Body() dto: CreateHrWorkLocationDto) {
    return this.service.createWorkLocation(this.getUser(req), dto);
  }

  @Patch('work-locations/:id')
  updateWorkLocation(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateHrWorkLocationDto) {
    return this.service.updateWorkLocation(this.getUser(req), id, dto);
  }

  @Delete('work-locations/:id')
  removeWorkLocation(@Req() req: Request, @Param('id') id: string) {
    return this.service.removeWorkLocation(this.getUser(req), id);
  }

  @Get('employment-statuses')
  listEmploymentStatuses(@Req() req: Request, @Query() query: any) {
    return this.service.listEmploymentStatuses(this.getUser(req), query || {});
  }

  @Get('employment-statuses/:id')
  findEmploymentStatusById(@Req() req: Request, @Param('id') id: string) {
    return this.service.findEmploymentStatusById(this.getUser(req), id);
  }

  @Post('employment-statuses')
  createEmploymentStatus(@Req() req: Request, @Body() dto: CreateHrEmploymentStatusDto) {
    return this.service.createEmploymentStatus(this.getUser(req), dto);
  }

  @Patch('employment-statuses/:id')
  updateEmploymentStatus(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateHrEmploymentStatusDto) {
    return this.service.updateEmploymentStatus(this.getUser(req), id, dto);
  }

  @Delete('employment-statuses/:id')
  removeEmploymentStatus(@Req() req: Request, @Param('id') id: string) {
    return this.service.removeEmploymentStatus(this.getUser(req), id);
  }

  @Get('document-types')
  listDocumentTypes(@Req() req: Request, @Query() query: any) {
    return this.service.listDocumentTypes(this.getUser(req), query || {});
  }

  @Get('document-types/:id')
  findDocumentTypeById(@Req() req: Request, @Param('id') id: string) {
    return this.service.findDocumentTypeById(this.getUser(req), id);
  }

  @Post('document-types')
  createDocumentType(@Req() req: Request, @Body() dto: CreateHrDocumentTypeDto) {
    return this.service.createDocumentType(this.getUser(req), dto);
  }

  @Patch('document-types/:id')
  updateDocumentType(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateHrDocumentTypeDto) {
    return this.service.updateDocumentType(this.getUser(req), id, dto);
  }

  @Delete('document-types/:id')
  removeDocumentType(@Req() req: Request, @Param('id') id: string) {
    return this.service.removeDocumentType(this.getUser(req), id);
  }

  @Get('marital-statuses')
  listMaritalStatuses(@Req() req: Request, @Query() query: any) {
    return this.service.listMaritalStatuses(this.getUser(req), query || {});
  }

  @Get('marital-statuses/:id')
  findMaritalStatusById(@Req() req: Request, @Param('id') id: string) {
    return this.service.findMaritalStatusById(this.getUser(req), id);
  }

  @Post('marital-statuses')
  createMaritalStatus(@Req() req: Request, @Body() dto: CreateHrMaritalStatusDto) {
    return this.service.createMaritalStatus(this.getUser(req), dto);
  }

  @Patch('marital-statuses/:id')
  updateMaritalStatus(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateHrMaritalStatusDto) {
    return this.service.updateMaritalStatus(this.getUser(req), id, dto);
  }

  @Delete('marital-statuses/:id')
  removeMaritalStatus(@Req() req: Request, @Param('id') id: string) {
    return this.service.removeMaritalStatus(this.getUser(req), id);
  }

  @Get('employees')
  listEmployees(@Req() req: Request, @Query() query: any) {
    return this.service.listEmployees(this.getUser(req), query || {});
  }

  @Get('employees/:id')
  findEmployeeById(@Req() req: Request, @Param('id') id: string) {
    return this.service.findEmployeeById(this.getUser(req), id);
  }

  @Post('employees')
  createEmployee(@Req() req: Request, @Body() dto: CreateHrEmployeeDto) {
    return this.service.createEmployee(this.getUser(req), dto);
  }

  @Patch('employees/:id')
  updateEmployee(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateHrEmployeeDto) {
    return this.service.updateEmployee(this.getUser(req), id, dto);
  }

  @Delete('employees/:id')
  removeEmployee(@Req() req: Request, @Param('id') id: string) {
    return this.service.removeEmployee(this.getUser(req), id);
  }

  @Get('department-assignments')
  listAssignments(@Req() req: Request, @Query() query: any) {
    return this.service.listAssignments(this.getUser(req), query || {});
  }

  @Get('department-assignments/:id')
  findAssignmentById(@Req() req: Request, @Param('id') id: string) {
    return this.service.findAssignmentById(this.getUser(req), id);
  }

  @Post('department-assignments')
  createAssignment(@Req() req: Request, @Body() dto: CreateHrDepartmentAssignmentDto) {
    return this.service.createAssignment(this.getUser(req), dto);
  }

  @Patch('department-assignments/:id')
  updateAssignment(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateHrDepartmentAssignmentDto) {
    return this.service.updateAssignment(this.getUser(req), id, dto);
  }

  @Delete('department-assignments/:id')
  removeAssignment(@Req() req: Request, @Param('id') id: string) {
    return this.service.removeAssignment(this.getUser(req), id);
  }

  @Get('employees/:employeeId/assignments')
  listEmployeeAssignments(@Req() req: Request, @Param('employeeId') employeeId: string, @Query() query: any) {
    return this.service.listAssignments(this.getUser(req), { ...(query || {}), employee_id: employeeId });
  }

  @Post('employees/:employeeId/assignments')
  createEmployeeAssignment(
    @Req() req: Request,
    @Param('employeeId') employeeId: string,
    @Body() dto: CreateHrDepartmentAssignmentDto,
  ) {
    return this.service.createAssignment(this.getUser(req), {
      ...dto,
      employee_id: employeeId,
    });
  }

  @Patch('employees/:employeeId/assignments/:assignmentId')
  updateEmployeeAssignment(
    @Req() req: Request,
    @Param('employeeId') employeeId: string,
    @Param('assignmentId') assignmentId: string,
    @Body() dto: UpdateHrDepartmentAssignmentDto,
  ) {
    return this.service.updateAssignment(this.getUser(req), assignmentId, {
      ...dto,
      employee_id: employeeId,
    });
  }

  @Delete('employees/:employeeId/assignments/:assignmentId')
  removeEmployeeAssignment(
    @Req() req: Request,
    @Param('assignmentId') assignmentId: string,
  ) {
    return this.service.removeAssignment(this.getUser(req), assignmentId);
  }

  @Get('work-schedules')
  listWorkSchedules(@Req() req: Request, @Query() query: any) {
    return this.service.listWorkSchedules(this.getUser(req), query || {});
  }

  @Get('work-schedules/:id')
  findWorkScheduleById(@Req() req: Request, @Param('id') id: string) {
    return this.service.findWorkScheduleById(this.getUser(req), id);
  }

  @Post('work-schedules')
  createWorkSchedule(@Req() req: Request, @Body() dto: CreateHrWorkScheduleDto) {
    return this.service.createWorkSchedule(this.getUser(req), dto);
  }

  @Patch('work-schedules/:id')
  updateWorkSchedule(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateHrWorkScheduleDto) {
    return this.service.updateWorkSchedule(this.getUser(req), id, dto);
  }

  @Delete('work-schedules/:id')
  removeWorkSchedule(@Req() req: Request, @Param('id') id: string) {
    return this.service.removeWorkSchedule(this.getUser(req), id);
  }

  @Get('employee-schedule-assignments')
  listEmployeeScheduleAssignments(@Req() req: Request, @Query() query: any) {
    return this.service.listEmployeeScheduleAssignments(this.getUser(req), query || {});
  }

  @Get('employee-schedule-assignments/:id')
  findEmployeeScheduleAssignmentById(@Req() req: Request, @Param('id') id: string) {
    return this.service.findEmployeeScheduleAssignmentById(this.getUser(req), id);
  }

  @Post('employee-schedule-assignments')
  createEmployeeScheduleAssignment(@Req() req: Request, @Body() dto: CreateHrEmployeeScheduleAssignmentDto) {
    return this.service.createEmployeeScheduleAssignment(this.getUser(req), dto);
  }

  @Patch('employee-schedule-assignments/:id')
  updateEmployeeScheduleAssignment(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateHrEmployeeScheduleAssignmentDto,
  ) {
    return this.service.updateEmployeeScheduleAssignment(this.getUser(req), id, dto);
  }

  @Delete('employee-schedule-assignments/:id')
  removeEmployeeScheduleAssignment(@Req() req: Request, @Param('id') id: string) {
    return this.service.removeEmployeeScheduleAssignment(this.getUser(req), id);
  }

  @Get('leave-types')
  listLeaveTypes(@Req() req: Request, @Query() query: any) {
    return this.service.listLeaveTypes(this.getUser(req), query || {});
  }

  @Get('leave-types/:id')
  findLeaveTypeById(@Req() req: Request, @Param('id') id: string) {
    return this.service.findLeaveTypeById(this.getUser(req), id);
  }

  @Post('leave-types')
  createLeaveType(@Req() req: Request, @Body() dto: CreateHrLeaveTypeDto) {
    return this.service.createLeaveType(this.getUser(req), dto);
  }

  @Patch('leave-types/:id')
  updateLeaveType(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateHrLeaveTypeDto) {
    return this.service.updateLeaveType(this.getUser(req), id, dto);
  }

  @Delete('leave-types/:id')
  removeLeaveType(@Req() req: Request, @Param('id') id: string) {
    return this.service.removeLeaveType(this.getUser(req), id);
  }

  @Get('leave-requests')
  listLeaveRequests(@Req() req: Request, @Query() query: any) {
    return this.service.listLeaveRequests(this.getUser(req), query || {});
  }

  @Get('leave-requests/:id')
  findLeaveRequestById(@Req() req: Request, @Param('id') id: string) {
    return this.service.findLeaveRequestById(this.getUser(req), id);
  }

  @Post('leave-requests')
  createLeaveRequest(@Req() req: Request, @Body() dto: CreateHrLeaveRequestDto) {
    return this.service.createLeaveRequest(this.getUser(req), dto);
  }

  @Patch('leave-requests/:id')
  updateLeaveRequest(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateHrLeaveRequestDto) {
    return this.service.updateLeaveRequest(this.getUser(req), id, dto);
  }

  @Delete('leave-requests/:id')
  removeLeaveRequest(@Req() req: Request, @Param('id') id: string) {
    return this.service.removeLeaveRequest(this.getUser(req), id);
  }

  @Get('skill-categories')
  listSkillCategories(@Req() req: Request, @Query() query: any) {
    return this.service.listSkillCategories(this.getUser(req), query || {});
  }

  @Get('skill-categories/:id')
  findSkillCategoryById(@Req() req: Request, @Param('id') id: string) {
    return this.service.findSkillCategoryById(this.getUser(req), id);
  }

  @Post('skill-categories')
  createSkillCategory(@Req() req: Request, @Body() dto: CreateHrSkillCategoryDto) {
    return this.service.createSkillCategory(this.getUser(req), dto);
  }

  @Patch('skill-categories/:id')
  updateSkillCategory(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateHrSkillCategoryDto) {
    return this.service.updateSkillCategory(this.getUser(req), id, dto);
  }

  @Delete('skill-categories/:id')
  removeSkillCategory(@Req() req: Request, @Param('id') id: string) {
    return this.service.removeSkillCategory(this.getUser(req), id);
  }

  @Get('skills')
  listSkills(@Req() req: Request, @Query() query: any) {
    return this.service.listSkills(this.getUser(req), query || {});
  }

  @Get('skills/:id')
  findSkillById(@Req() req: Request, @Param('id') id: string) {
    return this.service.findSkillById(this.getUser(req), id);
  }

  @Post('skills')
  createSkill(@Req() req: Request, @Body() dto: CreateHrSkillDto) {
    return this.service.createSkill(this.getUser(req), dto);
  }

  @Patch('skills/:id')
  updateSkill(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateHrSkillDto) {
    return this.service.updateSkill(this.getUser(req), id, dto);
  }

  @Delete('skills/:id')
  removeSkill(@Req() req: Request, @Param('id') id: string) {
    return this.service.removeSkill(this.getUser(req), id);
  }

  @Get('employee-skills')
  listEmployeeSkills(@Req() req: Request, @Query() query: any) {
    return this.service.listEmployeeSkills(this.getUser(req), query || {});
  }

  @Get('employee-skills/:id')
  findEmployeeSkillById(@Req() req: Request, @Param('id') id: string) {
    return this.service.findEmployeeSkillById(this.getUser(req), id);
  }

  @Post('employee-skills')
  createEmployeeSkill(@Req() req: Request, @Body() dto: CreateHrEmployeeSkillDto) {
    return this.service.createEmployeeSkill(this.getUser(req), dto);
  }

  @Patch('employee-skills/:id')
  updateEmployeeSkill(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateHrEmployeeSkillDto) {
    return this.service.updateEmployeeSkill(this.getUser(req), id, dto);
  }

  @Delete('employee-skills/:id')
  removeEmployeeSkill(@Req() req: Request, @Param('id') id: string) {
    return this.service.removeEmployeeSkill(this.getUser(req), id);
  }

  @Get('certifications')
  listCertifications(@Req() req: Request, @Query() query: any) {
    return this.service.listCertifications(this.getUser(req), query || {});
  }

  @Get('certifications/:id')
  findCertificationById(@Req() req: Request, @Param('id') id: string) {
    return this.service.findCertificationById(this.getUser(req), id);
  }

  @Post('certifications')
  createCertification(@Req() req: Request, @Body() dto: CreateHrCertificationDto) {
    return this.service.createCertification(this.getUser(req), dto);
  }

  @Patch('certifications/:id')
  updateCertification(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateHrCertificationDto) {
    return this.service.updateCertification(this.getUser(req), id, dto);
  }

  @Delete('certifications/:id')
  removeCertification(@Req() req: Request, @Param('id') id: string) {
    return this.service.removeCertification(this.getUser(req), id);
  }

  @Get('employee-certifications')
  listEmployeeCertifications(@Req() req: Request, @Query() query: any) {
    return this.service.listEmployeeCertifications(this.getUser(req), query || {});
  }

  @Get('employee-certifications/:id')
  findEmployeeCertificationById(@Req() req: Request, @Param('id') id: string) {
    return this.service.findEmployeeCertificationById(this.getUser(req), id);
  }

  @Post('employee-certifications')
  createEmployeeCertification(@Req() req: Request, @Body() dto: CreateHrEmployeeCertificationDto) {
    return this.service.createEmployeeCertification(this.getUser(req), dto);
  }

  @Patch('employee-certifications/:id')
  updateEmployeeCertification(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateHrEmployeeCertificationDto,
  ) {
    return this.service.updateEmployeeCertification(this.getUser(req), id, dto);
  }

  @Delete('employee-certifications/:id')
  removeEmployeeCertification(@Req() req: Request, @Param('id') id: string) {
    return this.service.removeEmployeeCertification(this.getUser(req), id);
  }

  @Get('lifecycle/templates')
  listLifecycleTemplates(@Req() req: Request, @Query() query: any) {
    return this.service.listLifecycleTemplates(this.getUser(req), query || {});
  }

  @Get('lifecycle/templates/:id')
  findLifecycleTemplateById(@Req() req: Request, @Param('id') id: string) {
    return this.service.findLifecycleTemplateById(this.getUser(req), id);
  }

  @Post('lifecycle/templates')
  createLifecycleTemplate(@Req() req: Request, @Body() dto: CreateHrLifecycleTemplateDto) {
    return this.service.createLifecycleTemplate(this.getUser(req), dto);
  }

  @Patch('lifecycle/templates/:id')
  updateLifecycleTemplate(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateHrLifecycleTemplateDto) {
    return this.service.updateLifecycleTemplate(this.getUser(req), id, dto);
  }

  @Delete('lifecycle/templates/:id')
  removeLifecycleTemplate(@Req() req: Request, @Param('id') id: string) {
    return this.service.removeLifecycleTemplate(this.getUser(req), id);
  }

  @Get('lifecycle/templates/:id/stages')
  listLifecycleTemplateStages(@Req() req: Request, @Param('id') templateId: string, @Query() query: any) {
    return this.service.listLifecycleStages(this.getUser(req), { ...(query || {}), template_id: templateId });
  }

  @Get('lifecycle/stages')
  listLifecycleStages(@Req() req: Request, @Query() query: any) {
    return this.service.listLifecycleStages(this.getUser(req), query || {});
  }

  @Post('lifecycle/stages')
  createLifecycleStage(@Req() req: Request, @Body() dto: CreateHrLifecycleStageDto) {
    return this.service.createLifecycleStage(this.getUser(req), dto);
  }

  @Post('lifecycle/templates/:id/stages')
  createLifecycleTemplateStage(
    @Req() req: Request,
    @Param('id') templateId: string,
    @Body() dto: CreateHrLifecycleStageDto,
  ) {
    return this.service.createLifecycleStage(this.getUser(req), {
      ...dto,
      template_id: templateId,
    });
  }

  @Get('lifecycle/stages/:id')
  findLifecycleStageById(@Req() req: Request, @Param('id') id: string) {
    return this.service.findLifecycleStageById(this.getUser(req), id);
  }

  @Patch('lifecycle/stages/:id')
  updateLifecycleStage(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateHrLifecycleStageDto) {
    return this.service.updateLifecycleStage(this.getUser(req), id, dto);
  }

  @Delete('lifecycle/stages/:id')
  removeLifecycleStage(@Req() req: Request, @Param('id') id: string) {
    return this.service.removeLifecycleStage(this.getUser(req), id);
  }

  @Get('lifecycle/templates/:id/tasks')
  listLifecycleTemplateTasks(@Req() req: Request, @Param('id') templateId: string, @Query() query: any) {
    return this.service.listLifecycleTasks(this.getUser(req), { ...(query || {}), template_id: templateId });
  }

  @Get('lifecycle/tasks')
  listLifecycleTasks(@Req() req: Request, @Query() query: any) {
    return this.service.listLifecycleTasks(this.getUser(req), query || {});
  }

  @Post('lifecycle/tasks')
  createLifecycleTask(@Req() req: Request, @Body() dto: CreateHrLifecycleTaskDto) {
    return this.service.createLifecycleTask(this.getUser(req), dto);
  }

  @Post('lifecycle/templates/:id/tasks')
  createLifecycleTemplateTask(
    @Req() req: Request,
    @Param('id') templateId: string,
    @Body() dto: CreateHrLifecycleTaskDto,
  ) {
    return this.service.createLifecycleTask(this.getUser(req), {
      ...dto,
      template_id: templateId,
    });
  }

  @Get('lifecycle/tasks/:id')
  findLifecycleTaskById(@Req() req: Request, @Param('id') id: string) {
    return this.service.findLifecycleTaskById(this.getUser(req), id);
  }

  @Patch('lifecycle/tasks/:id')
  updateLifecycleTask(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateHrLifecycleTaskDto) {
    return this.service.updateLifecycleTask(this.getUser(req), id, dto);
  }

  @Delete('lifecycle/tasks/:id')
  removeLifecycleTask(@Req() req: Request, @Param('id') id: string) {
    return this.service.removeLifecycleTask(this.getUser(req), id);
  }

  @Get('lifecycle/employee-lifecycles')
  listEmployeeLifecycles(@Req() req: Request, @Query() query: any) {
    return this.service.listEmployeeLifecycles(this.getUser(req), query || {});
  }

  @Get('lifecycle/employee-lifecycles/:id')
  findEmployeeLifecycleById(@Req() req: Request, @Param('id') id: string) {
    return this.service.findEmployeeLifecycleById(this.getUser(req), id);
  }

  @Post('lifecycle/employee-lifecycles')
  createEmployeeLifecycle(@Req() req: Request, @Body() dto: CreateHrEmployeeLifecycleDto) {
    return this.service.createEmployeeLifecycle(this.getUser(req), dto);
  }

  @Patch('lifecycle/employee-lifecycles/:id')
  updateEmployeeLifecycle(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateHrEmployeeLifecycleDto) {
    return this.service.updateEmployeeLifecycle(this.getUser(req), id, dto);
  }

  @Delete('lifecycle/employee-lifecycles/:id')
  removeEmployeeLifecycle(@Req() req: Request, @Param('id') id: string) {
    return this.service.removeEmployeeLifecycle(this.getUser(req), id);
  }

  @Get('lifecycle/employee-lifecycles/:id/tasks')
  listLifecycleInstanceTasks(@Req() req: Request, @Param('id') lifecycleId: string, @Query() query: any) {
    return this.service.listEmployeeLifecycleTasks(this.getUser(req), {
      ...(query || {}),
      employee_lifecycle_id: lifecycleId,
    } as any);
  }

  @Post('lifecycle/employee-lifecycles/:id/tasks')
  createLifecycleInstanceTask(
    @Req() req: Request,
    @Param('id') lifecycleId: string,
    @Body() dto: CreateHrEmployeeLifecycleTaskDto,
  ) {
    return this.service.createEmployeeLifecycleTask(this.getUser(req), {
      ...dto,
      employee_lifecycle_id: lifecycleId,
    });
  }

  @Get('lifecycle/employee-lifecycle-tasks')
  listEmployeeLifecycleTasks(@Req() req: Request, @Query() query: any) {
    return this.service.listEmployeeLifecycleTasks(this.getUser(req), query || {});
  }

  @Post('lifecycle/employee-lifecycle-tasks')
  createEmployeeLifecycleTaskGlobal(@Req() req: Request, @Body() dto: CreateHrEmployeeLifecycleTaskDto) {
    return this.service.createEmployeeLifecycleTask(this.getUser(req), dto);
  }

  @Get('lifecycle/employee-lifecycle-tasks/:id')
  findEmployeeLifecycleTaskById(@Req() req: Request, @Param('id') id: string) {
    return this.service.findEmployeeLifecycleTaskById(this.getUser(req), id);
  }

  @Patch('lifecycle/employee-lifecycle-tasks/:id')
  updateEmployeeLifecycleTask(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateHrEmployeeLifecycleTaskDto,
  ) {
    return this.service.updateEmployeeLifecycleTask(this.getUser(req), id, dto);
  }

  @Patch('lifecycle/employee-lifecycle-tasks/:id/move')
  moveEmployeeLifecycleTask(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: MoveHrEmployeeLifecycleTaskDto,
  ) {
    return this.service.moveEmployeeLifecycleTask(this.getUser(req), id, dto);
  }

  @Delete('lifecycle/employee-lifecycle-tasks/:id')
  removeEmployeeLifecycleTask(@Req() req: Request, @Param('id') id: string) {
    return this.service.removeEmployeeLifecycleTask(this.getUser(req), id);
  }

  @Get('lifecycle/kanban')
  getLifecycleKanban(
    @Req() req: Request,
    @Query('employee_id') employeeId?: string,
    @Query('type') type?: string,
  ) {
    return this.service.getLifecycleKanban(this.getUser(req), {
      employee_id: employeeId,
      type,
    });
  }

  @Post('setup-defaults')
  setupDefaults(@Req() req: Request, @Body() dto: HrSetupDefaultsDto) {
    return this.service.setupDefaults(this.getUser(req), dto || {});
  }
}
