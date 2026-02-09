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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/modules/auth/guards/roles.guard';
import { Roles } from 'src/modules/auth/decorators/roles.decorator';
import { CreateUserDTO } from './dto/create.dto';
import { UpdateUserDTO } from './dto/update.dto';
import { UserRole } from './enums';
import { UserService } from './user.service';

type AuthRequest = Request & { user?: { sub: string; tenant_id: string; role: string } };

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UserController {
  constructor(private readonly service: UserService) {}

  private getTenantId(req: AuthRequest): string {
    const tenantId = req.user?.tenant_id;
    if (!tenantId) throw new Error('Missing tenant_id in request user.');
    return tenantId;
  }

  @ApiOperation({ summary: 'Create user (ADMIN/MANAGER)' })
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Post()
  create(@Req() req: AuthRequest, @Body() data: CreateUserDTO) {
    return this.service.create(this.getTenantId(req), data);
  }

  @ApiOperation({ summary: 'List users' })
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Get()
  findAll(
    @Req() req: AuthRequest,
    @Query() query?: { company_id?: string; role?: string; status?: string },
  ) {
    return this.service.findAll(this.getTenantId(req), query);
  }

  @ApiOperation({ summary: 'Get user by id' })
  @ApiParam({ name: 'id' })
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Get(':id')
  findById(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.service.findById(this.getTenantId(req), id);
  }

  @ApiOperation({ summary: 'Update user (PATCH)' })
  @ApiParam({ name: 'id' })
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Patch(':id')
  update(@Req() req: AuthRequest, @Param('id') id: string, @Body() data: UpdateUserDTO) {
    return this.service.update(this.getTenantId(req), id, data);
  }

  @ApiOperation({ summary: 'Soft delete user (status=DELETED)' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'User marked as DELETED' })
  @Roles(UserRole.ADMIN)
  @Delete(':id')
  remove(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.service.remove(this.getTenantId(req), id);
  }
}
