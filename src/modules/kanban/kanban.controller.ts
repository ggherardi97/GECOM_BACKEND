import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { KanbanService } from './kanban.service';
import { CreateBoardDto } from './dto/create-board.dto';
import { UpdateBoardDto } from './dto/update-board.dto';
import { CreateColumnDto } from './dto/create-column.dto';
import { UpdateColumnDto } from './dto/update-column.dto';
import { CreateCardDto } from './dto/create-card.dto';
import { UpdateCardDto } from './dto/update-card.dto';
import { MoveCardDto } from './dto/move-card.dto';
import { CreateTagDto } from './dto/create-tag.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { SetCardAssigneesDto } from './dto/set-card-assignees.dto';

@ApiTags('kanban')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('kanban')
export class KanbanController {
  constructor(private readonly service: KanbanService) {}

  private getUser(req: Request) {
    const user = ((req as any)?.user ?? {}) as any;

    const id = String(user.id ?? user.user_id ?? user.userId ?? user.sub ?? '').trim();
    const tenant_id = String(user.tenant_id ?? user.tenantId ?? '').trim();

    if (!id || !tenant_id) {
      throw new UnauthorizedException('Authentication context missing: req.user.id / req.user.tenant_id');
    }

    return {
      id,
      user_id: id,
      tenant_id,
      role: user.role ? String(user.role) : undefined,
    };
  }

  @Get('boards')
  async listBoards(@Req() req: Request, @Query() query: { include_inactive?: string }) {
    return this.service.listBoards(this.getUser(req), query);
  }

  @Get('boards/:boardId')
  async getBoard(@Req() req: Request, @Param('boardId') boardId: string) {
    return this.service.getBoard(this.getUser(req), boardId);
  }

  @Post('boards')
  async createBoard(@Req() req: Request, @Body() dto: CreateBoardDto) {
    return this.service.createBoard(this.getUser(req), dto);
  }

  @Patch('boards/:boardId')
  async updateBoard(@Req() req: Request, @Param('boardId') boardId: string, @Body() dto: UpdateBoardDto) {
    return this.service.updateBoard(this.getUser(req), boardId, dto);
  }

  @Delete('boards/:boardId')
  async deactivateBoard(@Req() req: Request, @Param('boardId') boardId: string) {
    return this.service.deactivateBoard(this.getUser(req), boardId);
  }

  @Post('boards/:boardId/columns')
  async createColumn(@Req() req: Request, @Param('boardId') boardId: string, @Body() dto: CreateColumnDto) {
    return this.service.createColumn(this.getUser(req), boardId, dto);
  }

  @Patch('columns/:columnId')
  async updateColumn(@Req() req: Request, @Param('columnId') columnId: string, @Body() dto: UpdateColumnDto) {
    return this.service.updateColumn(this.getUser(req), columnId, dto);
  }

  @Delete('columns/:columnId')
  async deleteColumn(@Req() req: Request, @Param('columnId') columnId: string) {
    return this.service.deleteColumn(this.getUser(req), columnId);
  }

  @Post('cards')
  async createCard(@Req() req: Request, @Body() dto: CreateCardDto) {
    return this.service.createCard(this.getUser(req), dto);
  }

  @Patch('cards/:cardId')
  async updateCard(@Req() req: Request, @Param('cardId') cardId: string, @Body() dto: UpdateCardDto) {
    return this.service.updateCard(this.getUser(req), cardId, dto);
  }

  @Post('cards/:cardId/move')
  async moveCard(@Req() req: Request, @Param('cardId') cardId: string, @Body() dto: MoveCardDto) {
    return this.service.moveCard(this.getUser(req), cardId, dto);
  }

  @Delete('cards/:cardId')
  async deleteCard(@Req() req: Request, @Param('cardId') cardId: string) {
    return this.service.deleteCard(this.getUser(req), cardId);
  }

  @Get('cards/:cardId/comments')
  async listComments(@Req() req: Request, @Param('cardId') cardId: string) {
    return this.service.listComments(this.getUser(req), cardId);
  }

  @Post('cards/:cardId/comments')
  async addComment(@Req() req: Request, @Param('cardId') cardId: string, @Body() dto: CreateCommentDto) {
    return this.service.addComment(this.getUser(req), cardId, dto);
  }

  @Put('cards/:cardId/assignees')
  async setAssignees(@Req() req: Request, @Param('cardId') cardId: string, @Body() dto: SetCardAssigneesDto) {
    return this.service.setAssignees(this.getUser(req), cardId, dto);
  }

  @Get('tags')
  async listTags(@Req() req: Request) {
    return this.service.listTags(this.getUser(req));
  }

  @Post('tags')
  async createTag(@Req() req: Request, @Body() dto: CreateTagDto) {
    return this.service.createTag(this.getUser(req), dto);
  }

  @Post('cards/:cardId/tags/:tagId')
  async attachTag(@Req() req: Request, @Param('cardId') cardId: string, @Param('tagId') tagId: string) {
    return this.service.attachTag(this.getUser(req), cardId, tagId);
  }

  @Delete('cards/:cardId/tags/:tagId')
  async removeTag(@Req() req: Request, @Param('cardId') cardId: string, @Param('tagId') tagId: string) {
    return this.service.removeTag(this.getUser(req), cardId, tagId);
  }
}
