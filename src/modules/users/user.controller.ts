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
import { UpdateMyProfileDTO } from './dto/update-my-profile.dto';
import { UpdateProfilePictureDTO } from './dto/update-profile-picture.dto';
import { UserRole } from './enums';
import { UserService } from './user.service';
import { AccessResource } from '../access-control/decorators/access-resource.decorator';

type AuthRequest = Request & {
  user?: {
    sub?: string;
    tenant_id?: string;
    role?: string;
    // Some apps use id/userId instead of sub
    id?: string;
    userId?: string;
  };
};

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@AccessResource('users')
@Controller('users')
export class UserController {
  constructor(private readonly service: UserService) {}

  private getTenantId(req: AuthRequest): string {
    const tenantId = req.user?.tenant_id;
    if (!tenantId) throw new Error('Missing tenant_id in request user.');
    return tenantId;
  }

private getUserId(req: AuthRequest): string {
  const u: any = req.user ?? {};

  // Common possibilities across different JWT strategies/apps
  const userId =
    u.sub ??
    u.id ??
    u.userId ??
    u.user_id ??
    u.userid ??
    u.uid ??
    u.user_id_fk ??
    u.user?.sub ??
    u.user?.id ??
    u.user?.userId ??
    u.user?.user_id ??
    u.payload?.sub ??
    u.payload?.id ??
    u.payload?.userId ??
    u.payload?.user_id;

  if (!userId) {
    // Keep this message very explicit for debugging in logs
    const keys = Object.keys(u || {});
    throw new Error(`Missing user id in request user. Available keys: ${keys.join(', ')}`);
  }

  return String(userId);
}


  // -----------------------
  // ME endpoints
  // -----------------------

  @ApiOperation({ summary: 'Get my user (safe)' })
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.USER, UserRole.CUSTOMER)
  @Get('me')
  me(@Req() req: AuthRequest) {
    return this.service.findById(this.getTenantId(req), this.getUserId(req));
  }

  @ApiOperation({ summary: 'Update my profile (name/phone/password/accept terms)' })
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.USER, UserRole.CUSTOMER)
  @Patch('me')
  updateMe(@Req() req: AuthRequest, @Body() data: UpdateMyProfileDTO) {
    return this.service.updateMyProfile(this.getTenantId(req), this.getUserId(req), data);
  }

  @ApiOperation({ summary: 'Accept terms (me)' })
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.USER, UserRole.CUSTOMER)
  @Post('me/accept-terms')
  acceptTerms(@Req() req: AuthRequest) {
    return this.service.acceptMyTerms(this.getTenantId(req), this.getUserId(req));
  }

  @ApiOperation({ summary: 'Get my profile picture as base64' })
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.USER, UserRole.CUSTOMER)
  @Get('me/profile-picture')
  getMyPicture(@Req() req: AuthRequest) {
    return this.service.getMyProfilePictureBase64(this.getTenantId(req), this.getUserId(req));
  }

  @ApiOperation({ summary: 'Update my profile picture (base64). Send empty to clear.' })
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.USER, UserRole.CUSTOMER)
  @Patch('me/profile-picture')
  updateMyPicture(@Req() req: AuthRequest, @Body() data: UpdateProfilePictureDTO) {
    return this.service.updateMyProfilePicture(this.getTenantId(req), this.getUserId(req), data);
  }

  // -----------------------
  // Profile picture by ID (ADMIN/MANAGER)
  // NOTE: We reuse the existing service methods (getMy*/updateMy*) to avoid changing service now.
  // -----------------------

  @ApiOperation({ summary: 'Get user profile picture (base64) by user id (ADMIN/MANAGER)' })
  @ApiParam({ name: 'id' })
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Get(':id/profile-picture')
  getUserPictureById(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.service.getMyProfilePictureBase64(this.getTenantId(req), id);
  }

  @ApiOperation({ summary: 'Update user profile picture (base64) by user id (ADMIN/MANAGER). Send empty to clear.' })
  @ApiParam({ name: 'id' })
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Patch(':id/profile-picture')
  updateUserPictureById(@Req() req: AuthRequest, @Param('id') id: string, @Body() data: UpdateProfilePictureDTO) {
    return this.service.updateMyProfilePicture(this.getTenantId(req), id, data);
  }

  // -----------------------
  // Existing ADMIN/MANAGER APIs
  // -----------------------

  @ApiOperation({ summary: 'Create user (ADMIN/MANAGER)' })
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Post()
  create(@Req() req: AuthRequest, @Body() data: CreateUserDTO) {
    const headers = (req as any)?.headers || {};
    const hostRaw = headers['x-forwarded-host'] || headers.host || null;
    const protoRaw = headers['x-forwarded-proto'] || headers['x-forwarded-protocol'] || null;
    const host = Array.isArray(hostRaw) ? hostRaw[0] : hostRaw;
    const protocol = Array.isArray(protoRaw) ? protoRaw[0] : protoRaw;

    return this.service.create(this.getTenantId(req), data, {
      host: typeof host === 'string' ? host : null,
      protocol: typeof protocol === 'string' ? protocol : null,
    });
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
