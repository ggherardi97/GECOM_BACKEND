import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { FlyCheckerService } from './fly-checker.service';
import { FlyCheckerScheduler } from './fly-checker.scheduler';
import { CreateFlySearchDto, UpdateFlySearchDto } from './dto/search.dto';
import type { Scope } from './fly-checker.types';

@Controller('fly-checker')
export class FlyCheckerController {
  constructor(
    private readonly service: FlyCheckerService,
    private readonly scheduler: FlyCheckerScheduler
  ) {}
  private scope(req: any): Scope {
    if (!req.user?.tenant_id || !req.user?.user_id) throw new UnauthorizedException();
    return { tenantId: req.user.tenant_id, userId: req.user.user_id };
  }
  private page(page: number) {
    if (page < 1 || page > 10000) throw new BadRequestException('Página inválida.');
    return page;
  }
  @Get('status') status() {
    return this.service.status();
  }
  @Get('searches') list(
    @Req() req: any,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number
  ) {
    return this.service.list(this.scope(req), this.page(page));
  }
  @Post('searches') async create(@Req() req: any, @Body() body: CreateFlySearchDto) {
    const row = await this.service.create(this.scope(req), body);
    this.scheduler.kick();
    return row;
  }
  @Get('searches/:id') detail(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number
  ) {
    return this.service.detail(this.scope(req), id, this.page(page));
  }
  @Patch('searches/:id') update(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateFlySearchDto
  ) {
    return this.service.update(this.scope(req), id, body);
  }
  @Delete('searches/:id')
  remove(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(this.scope(req), id);
  }
  @Post('searches/:id/check')
  @HttpCode(202)
  async check(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    const result = await this.service.queue(this.scope(req), id);
    this.scheduler.kick();
    return result;
  }
}
