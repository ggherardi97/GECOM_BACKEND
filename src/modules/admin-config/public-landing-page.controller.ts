import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { AdminConfigService } from './admin-config.service';

@ApiTags('public-landing-page')
@Public()
@Controller('public/landing-page')
export class PublicLandingPageController {
  constructor(private readonly service: AdminConfigService) {}

  @Get()
  getByLookup(
    @Query('tenant') tenant?: string,
    @Query('url') requestedUrl?: string,
    @Query('host') requestedHost?: string,
    @Query('path') requestedPath?: string,
  ) {
    return this.service.getPublishedLandingPagePublic({
      tenantRef: tenant,
      requestedUrl,
      requestedHost,
      requestedPath,
    });
  }

  @Get(':tenantRef')
  getByTenantRef(
    @Param('tenantRef') tenantRef: string,
    @Query('url') requestedUrl?: string,
    @Query('host') requestedHost?: string,
    @Query('path') requestedPath?: string,
  ) {
    return this.service.getPublishedLandingPagePublic({
      tenantRef,
      requestedUrl,
      requestedHost,
      requestedPath,
    });
  }
}
