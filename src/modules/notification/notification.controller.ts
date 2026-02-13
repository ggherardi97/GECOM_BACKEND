import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { CreateNotificationDTO } from './dto/create.dto';
import { UpdateNotificationDTO } from './dto/update.dto';

@Controller()
export class NotificationController {
  constructor(private readonly service: NotificationService) {}

  // GET /notifications/my?unread_only=true
  @Get('notifications/my')
  async findMy(@Req() req: any, @Query() query: any) {
    return this.service.findMy(req.user, query);
  }

  // GET /notifications/admin?company_id=&is_active=&q=&include_expired=
  @Get('notifications/admin')
  async adminList(@Req() req: any, @Query() query: any) {
    return this.service.adminList(req.user, query);
  }

  // GET /notifications/:id
  @Get('notifications/:id')
  async findById(@Req() req: any, @Param('id') id: string) {
    return this.service.findById(req.user, id);
  }

  // POST /notifications (ADMIN/MANAGER)
  @Post('notifications')
  async create(@Req() req: any, @Body() body: CreateNotificationDTO) {
    return this.service.create(req.user, body);
  }

  // PATCH /notifications/:id (ADMIN/MANAGER)
  @Patch('notifications/:id')
  async update(@Req() req: any, @Param('id') id: string, @Body() body: UpdateNotificationDTO) {
    return this.service.update(req.user, id, body);
  }

  // DELETE /notifications/:id -> soft deactivate (ADMIN/MANAGER)
  @Delete('notifications/:id')
  async deactivate(@Req() req: any, @Param('id') id: string) {
    return this.service.deactivate(req.user, id);
  }

  // POST /notifications/:id/read -> marks as read for current user
  @Post('notifications/:id/read')
  async markRead(@Req() req: any, @Param('id') id: string) {
    return this.service.markRead(req.user, id);
  }
}
