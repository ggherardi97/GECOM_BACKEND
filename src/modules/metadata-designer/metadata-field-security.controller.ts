import { Body, Controller, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../users/enums/user.role';
import { getMetadataAuthUser } from './metadata-auth.util';
import { CreateSecurityProfileDto } from './dto/create-security-profile.dto';
import { UpdateSecurityProfileDto } from './dto/update-security-profile.dto';
import { UpsertFieldSecurityDto } from './dto/upsert-field-security.dto';
import { MetadataFieldSecurityService } from './metadata-field-security.service';

@ApiTags('metadata-field-security')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('metadata')
export class MetadataFieldSecurityController {
  constructor(private readonly fieldSecurityService: MetadataFieldSecurityService) {}

  @Get('fields/:fieldId/security')
  getFieldSecurity(@Req() req: Request, @Param('fieldId') fieldId: string) {
    return this.fieldSecurityService.getFieldSecurity(getMetadataAuthUser(req), fieldId);
  }

  @Put('fields/:fieldId/security')
  upsertFieldSecurity(
    @Req() req: Request,
    @Param('fieldId') fieldId: string,
    @Body() dto: UpsertFieldSecurityDto,
  ) {
    return this.fieldSecurityService.upsertFieldSecurity(getMetadataAuthUser(req), fieldId, dto);
  }

  @Get('security/profiles')
  listProfiles(@Req() req: Request) {
    return this.fieldSecurityService.listProfiles(getMetadataAuthUser(req));
  }

  @Post('security/profiles')
  createProfile(@Req() req: Request, @Body() dto: CreateSecurityProfileDto) {
    return this.fieldSecurityService.createProfile(getMetadataAuthUser(req), dto);
  }

  @Put('security/profiles/:id')
  updateProfile(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateSecurityProfileDto) {
    return this.fieldSecurityService.updateProfile(getMetadataAuthUser(req), id, dto);
  }
}

