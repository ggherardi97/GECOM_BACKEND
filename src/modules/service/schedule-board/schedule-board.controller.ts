import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { getTenantId } from '../common/request-auth.util';
import { ScheduleBoardService } from './schedule-board.service';

@UseGuards(JwtAuthGuard)
@Controller('service/schedule-board')
export class ScheduleBoardController {
  constructor(private readonly service: ScheduleBoardService) {}

  @Get()
  getBoard(@Req() req: any, @Query('date') date?: string) {
    return this.service.getBoard(getTenantId(req), date);
  }

  @Get('work-orders/:id/suggestions')
  suggest(@Req() req: any, @Param('id') id: string, @Query('date') date?: string) {
    return this.service.suggestWorkOrderSlots(getTenantId(req), id, date);
  }

  @Post('book')
  book(@Req() req: any, @Body() dto: any) {
    return this.service.bookWorkOrder(getTenantId(req), dto || {});
  }

  @Patch('appointments/:id')
  move(@Req() req: any, @Param('id') id: string, @Body() dto: any) {
    return this.service.bookWorkOrder(getTenantId(req), {
      ...(dto || {}),
      appointment_id: id,
    });
  }
}
