import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../users/enums';
import { AccessControlService } from './access-control.service';
import {
  CreateAccessRoleDto,
  ListAccessUsersQueryDto,
  UpdateAccessRoleDto,
  UpdateRolePermissionsDto,
  UpdateUserRolesDto,
} from './dto/access-control.dto';

@ApiTags('admin-access')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/access')
export class AdminAccessController {
  constructor(private readonly accessControlService: AccessControlService) {}

  @Get('entities')
  listEntities(@Req() req: Request) {
    return this.accessControlService.listEntities((req as any).user);
  }

  @Get('roles')
  listRoles(@Req() req: Request) {
    return this.accessControlService.listRoles((req as any).user);
  }

  @Post('roles')
  createRole(@Req() req: Request, @Body() dto: CreateAccessRoleDto) {
    return this.accessControlService.createRole((req as any).user, dto);
  }

  @Patch('roles/:roleId')
  updateRole(@Req() req: Request, @Param('roleId') roleId: string, @Body() dto: UpdateAccessRoleDto) {
    return this.accessControlService.updateRole((req as any).user, roleId, dto);
  }

  @Delete('roles/:roleId')
  deleteRole(@Req() req: Request, @Param('roleId') roleId: string) {
    return this.accessControlService.deleteRole((req as any).user, roleId);
  }

  @Get('roles/:roleId/permissions')
  getRolePermissions(@Req() req: Request, @Param('roleId') roleId: string) {
    return this.accessControlService.getRolePermissions((req as any).user, roleId);
  }

  @Put('roles/:roleId/permissions')
  updateRolePermissions(
    @Req() req: Request,
    @Param('roleId') roleId: string,
    @Body() dto: UpdateRolePermissionsDto,
  ) {
    return this.accessControlService.updateRolePermissions((req as any).user, roleId, dto);
  }

  @Get('users')
  listUsers(@Req() req: Request, @Query() query: ListAccessUsersQueryDto) {
    return this.accessControlService.listUsers((req as any).user, query);
  }

  @Get('users/:userId/roles')
  getUserRoles(@Req() req: Request, @Param('userId') userId: string) {
    return this.accessControlService.getUserRoles((req as any).user, userId);
  }

  @Put('users/:userId/roles')
  updateUserRoles(@Req() req: Request, @Param('userId') userId: string, @Body() dto: UpdateUserRolesDto) {
    return this.accessControlService.updateUserRoles((req as any).user, userId, dto);
  }
}

@ApiTags('me-access')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('me')
export class MeAccessController {
  constructor(private readonly accessControlService: AccessControlService) {}

  @Get('access')
  getMeAccess(@Req() req: Request) {
    return this.accessControlService.getMeAccess((req as any).user);
  }
}
