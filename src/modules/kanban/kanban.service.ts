import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  board_card_audit_action_enum,
  board_card_priority_enum,
  board_entity_type_enum,
  view_visibility_enum,
} from '@prisma/client';
import { AutomationDispatcherService } from '../automation/automation-dispatcher.service';
import { KanbanRepository } from './kanban.repository';
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

type AuthUser = {
  id?: string;
  user_id?: string;
  tenant_id: string;
  role?: string | null;
};

@Injectable()
export class KanbanService {
  constructor(
    private readonly repository: KanbanRepository,
    private readonly automationDispatcher: AutomationDispatcherService,
  ) {}

  private getUserId(user: AuthUser): string {
    const id = String(user.id ?? user.user_id ?? '').trim();
    if (!id) throw new BadRequestException('Authenticated user id is missing');
    return id;
  }

  private isPrivileged(user: AuthUser): boolean {
    const role = String(user.role ?? '').toUpperCase();
    return role === 'ADMIN' || role === 'MANAGER';
  }

  private canReadBoard(user: AuthUser, board: any): boolean {
    if (!board) return false;
    if (this.isPrivileged(user)) return true;

    const userId = this.getUserId(user);
    if (board.owner_user_id === userId) return true;

    return board.visibility === 'PUBLIC' || board.visibility === 'SHARED';
  }

  private canWriteBoard(user: AuthUser, board: any): boolean {
    if (!board) return false;
    if (this.isPrivileged(user)) return true;

    const userId = this.getUserId(user);
    return board.owner_user_id === userId;
  }

  async listBoards(user: AuthUser, query?: { include_inactive?: string }) {
    const userId = this.getUserId(user);
    const includeInactive = String(query?.include_inactive ?? 'false').toLowerCase() === 'true';

    return this.repository.listBoards({
      tenantId: user.tenant_id,
      userId,
      isPrivileged: this.isPrivileged(user),
      includeInactive,
    });
  }

  async getBoard(user: AuthUser, boardId: string) {
    const board = await this.repository.findBoardById({ tenantId: user.tenant_id, boardId });
    if (!board) throw new NotFoundException('Board not found');
    if (!this.canReadBoard(user, board)) throw new ForbiddenException('You do not have access to this board');
    return board;
  }

  async createBoard(user: AuthUser, dto: CreateBoardDto) {
    const userId = this.getUserId(user);

    return this.repository.createBoard({
      tenantId: user.tenant_id,
      ownerUserId: userId,
      name: dto.name,
      description: dto.description,
      entityType: dto.entity_type as unknown as board_entity_type_enum,
      companyId: dto.company_id,
      processId: dto.process_id,
      invoiceId: dto.invoice_id,
      visibility: dto.visibility as unknown as view_visibility_enum,
      isActive: dto.is_active,
      columns: dto.columns,
    });
  }

  async updateBoard(user: AuthUser, boardId: string, dto: UpdateBoardDto) {
    const board = await this.repository.findBoardById({ tenantId: user.tenant_id, boardId });
    if (!board) throw new NotFoundException('Board not found');
    if (!this.canWriteBoard(user, board)) throw new ForbiddenException('You cannot update this board');

    const updated = await this.repository.updateBoard({
      tenantId: user.tenant_id,
      boardId,
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.entity_type !== undefined ? { entity_type: dto.entity_type as unknown as board_entity_type_enum } : {}),
        ...(dto.company_id !== undefined ? { company_id: dto.company_id } : {}),
        ...(dto.process_id !== undefined ? { process_id: dto.process_id } : {}),
        ...(dto.invoice_id !== undefined ? { invoice_id: dto.invoice_id } : {}),
        ...(dto.visibility !== undefined ? { visibility: dto.visibility as unknown as view_visibility_enum } : {}),
        ...(dto.is_active !== undefined ? { is_active: dto.is_active } : {}),
        updated_at: new Date(),
      },
    });

    if (!updated) throw new NotFoundException('Board not found');
    return updated;
  }

  async deactivateBoard(user: AuthUser, boardId: string) {
    const board = await this.repository.findBoardById({ tenantId: user.tenant_id, boardId });
    if (!board) throw new NotFoundException('Board not found');
    if (!this.canWriteBoard(user, board)) throw new ForbiddenException('You cannot delete this board');

    await this.repository.deactivateBoard({ tenantId: user.tenant_id, boardId });
    return { ok: true };
  }

  async createColumn(user: AuthUser, boardId: string, dto: CreateColumnDto) {
    const board = await this.repository.findBoardById({ tenantId: user.tenant_id, boardId });
    if (!board) throw new NotFoundException('Board not found');
    if (!this.canWriteBoard(user, board)) throw new ForbiddenException('You cannot create columns in this board');

    return this.repository.createColumn({
      tenantId: user.tenant_id,
      boardId,
      name: dto.name,
      sortOrder: dto.sort_order,
      wipLimit: dto.wip_limit,
      color: dto.color,
      isDone: dto.is_done,
    });
  }

  async updateColumn(user: AuthUser, columnId: string, dto: UpdateColumnDto) {
    const column = await this.repository.findColumnById({ tenantId: user.tenant_id, columnId });
    if (!column) throw new NotFoundException('Column not found');

    const board = await this.repository.findBoardById({ tenantId: user.tenant_id, boardId: column.board_id });
    if (!board) throw new NotFoundException('Board not found');
    if (!this.canWriteBoard(user, board)) throw new ForbiddenException('You cannot update columns in this board');

    const updated = await this.repository.updateColumn({
      tenantId: user.tenant_id,
      columnId,
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.sort_order !== undefined ? { sort_order: dto.sort_order } : {}),
        ...(dto.wip_limit !== undefined ? { wip_limit: dto.wip_limit } : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
        ...(dto.is_done !== undefined ? { is_done: dto.is_done } : {}),
        updated_at: new Date(),
      },
    });

    if (!updated) throw new NotFoundException('Column not found');
    return updated;
  }

  async deleteColumn(user: AuthUser, columnId: string) {
    const column = await this.repository.findColumnById({ tenantId: user.tenant_id, columnId });
    if (!column) throw new NotFoundException('Column not found');

    const board = await this.repository.findBoardById({ tenantId: user.tenant_id, boardId: column.board_id });
    if (!board) throw new NotFoundException('Board not found');
    if (!this.canWriteBoard(user, board)) throw new ForbiddenException('You cannot delete columns in this board');

    try {
      await this.repository.deleteColumn({ tenantId: user.tenant_id, columnId });
    } catch {
      throw new BadRequestException('Column cannot be removed while it still has cards');
    }

    return { ok: true };
  }

  async createCard(user: AuthUser, dto: CreateCardDto) {
    const userId = this.getUserId(user);
    const board = await this.repository.findBoardById({ tenantId: user.tenant_id, boardId: dto.board_id });
    if (!board) throw new NotFoundException('Board not found');
    if (!this.canWriteBoard(user, board)) throw new ForbiddenException('You cannot create cards in this board');

    const column = await this.repository.findColumnById({ tenantId: user.tenant_id, columnId: dto.column_id });
    if (!column || column.board_id !== dto.board_id) {
      throw new BadRequestException('Column does not belong to board');
    }

    const created = await this.repository.createCard({
      tenantId: user.tenant_id,
      boardId: dto.board_id,
      columnId: dto.column_id,
      title: dto.title,
      description: dto.description,
      priority: dto.priority as unknown as board_card_priority_enum,
      dueDate: dto.due_date ? new Date(dto.due_date) : undefined,
      startDate: dto.start_date ? new Date(dto.start_date) : undefined,
      sortOrder: dto.sort_order,
      createdByUserId: userId,
      assignedToUserId: dto.assigned_to_user_id,
      companyId: dto.company_id,
      processId: dto.process_id,
      invoiceId: dto.invoice_id,
      relatedTable: dto.related_table,
      relatedId: dto.related_id,
      assigneeUserIds: dto.assignee_user_ids,
    });

    if (!created) throw new BadRequestException('Failed to create card');

    await this.repository.createCardAudit({
      tenantId: user.tenant_id,
      cardId: created.id,
      action: board_card_audit_action_enum.CREATED,
      createdByUserId: userId,
      toColumnId: dto.column_id,
      metaJson: {
        title: dto.title,
      },
    });

    this.dispatchCardAutomation({
      tenantId: user.tenant_id,
      userId,
      eventType: 'CREATE',
      after: created,
      changedFields: ['board_id', 'column_id', 'title', 'description', 'priority'],
    });

    return created;
  }

  async updateCard(user: AuthUser, cardId: string, dto: UpdateCardDto) {
    const userId = this.getUserId(user);
    const card = await this.repository.findCardById({ tenantId: user.tenant_id, cardId });
    if (!card) throw new NotFoundException('Card not found');

    const board = await this.repository.findBoardById({ tenantId: user.tenant_id, boardId: card.board_id });
    if (!board) throw new NotFoundException('Board not found');
    if (!this.canWriteBoard(user, board)) throw new ForbiddenException('You cannot update this card');

    const updated = await this.repository.updateCard({
      tenantId: user.tenant_id,
      cardId,
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority as unknown as board_card_priority_enum } : {}),
        ...(dto.due_date !== undefined ? { due_date: dto.due_date ? new Date(dto.due_date) : null } : {}),
        ...(dto.start_date !== undefined ? { start_date: dto.start_date ? new Date(dto.start_date) : null } : {}),
        ...(dto.sort_order !== undefined ? { sort_order: dto.sort_order } : {}),
        ...(dto.assigned_to_user_id !== undefined ? { assigned_to_user_id: dto.assigned_to_user_id } : {}),
        ...(dto.company_id !== undefined ? { company_id: dto.company_id } : {}),
        ...(dto.process_id !== undefined ? { process_id: dto.process_id } : {}),
        ...(dto.invoice_id !== undefined ? { invoice_id: dto.invoice_id } : {}),
        ...(dto.related_table !== undefined ? { related_table: dto.related_table } : {}),
        ...(dto.related_id !== undefined ? { related_id: dto.related_id } : {}),
        ...(dto.completed_at !== undefined
          ? { completed_at: dto.completed_at === null ? null : new Date(dto.completed_at) }
          : {}),
        updated_at: new Date(),
      },
    });

    if (!updated) throw new NotFoundException('Card not found');

    await this.repository.createCardAudit({
      tenantId: user.tenant_id,
      cardId,
      action: board_card_audit_action_enum.UPDATED,
      createdByUserId: userId,
      metaJson: { updated_fields: Object.keys(dto) },
    });

    this.dispatchCardAutomation({
      tenantId: user.tenant_id,
      userId,
      eventType: 'UPDATE',
      before: card,
      after: updated,
      changedFields: Object.keys(dto || {}),
    });

    return updated;
  }

  async moveCard(user: AuthUser, cardId: string, dto: MoveCardDto) {
    const userId = this.getUserId(user);
    const card = await this.repository.findCardById({ tenantId: user.tenant_id, cardId });
    if (!card) throw new NotFoundException('Card not found');

    const board = await this.repository.findBoardById({ tenantId: user.tenant_id, boardId: card.board_id });
    if (!board) throw new NotFoundException('Board not found');
    if (!this.canWriteBoard(user, board)) throw new ForbiddenException('You cannot move this card');

    const moved = await this.repository.moveCard({
      tenantId: user.tenant_id,
      cardId,
      targetColumnId: dto.target_column_id,
      targetOrder: dto.target_order,
    });

    if (!moved) throw new BadRequestException('Invalid target column');

    await this.repository.createCardAudit({
      tenantId: user.tenant_id,
      cardId,
      action: board_card_audit_action_enum.MOVED,
      createdByUserId: userId,
      fromColumnId: card.column_id,
      toColumnId: dto.target_column_id,
      metaJson: {
        target_order: dto.target_order ?? null,
      },
    });

    this.dispatchCardAutomation({
      tenantId: user.tenant_id,
      userId,
      eventType: 'UPDATE',
      before: card,
      after: moved,
      changedFields: ['column_id', 'sort_order', 'completed_at'],
    });

    return moved;
  }

  async deleteCard(user: AuthUser, cardId: string) {
    const userId = this.getUserId(user);
    const card = await this.repository.findCardById({ tenantId: user.tenant_id, cardId });
    if (!card) throw new NotFoundException('Card not found');

    const board = await this.repository.findBoardById({ tenantId: user.tenant_id, boardId: card.board_id });
    if (!board) throw new NotFoundException('Board not found');
    if (!this.canWriteBoard(user, board)) throw new ForbiddenException('You cannot delete this card');

    await this.repository.createCardAudit({
      tenantId: user.tenant_id,
      cardId,
      action: board_card_audit_action_enum.DELETED,
      createdByUserId: userId,
      fromColumnId: card.column_id,
    });

    await this.repository.deleteCard({ tenantId: user.tenant_id, cardId });
    return { ok: true };
  }

  private dispatchCardAutomation(args: {
    tenantId: string;
    userId: string;
    eventType: 'CREATE' | 'UPDATE';
    before?: Record<string, any> | null;
    after?: Record<string, any> | null;
    changedFields?: string[];
  }) {
    const after = args.after || null;
    if (!after?.id) return;

    this.automationDispatcher.dispatch({
      tenantId: args.tenantId,
      userId: args.userId,
      entityName: 'board_cards',
      eventType: args.eventType,
      recordId: String(after.id),
      changedFields: Array.isArray(args.changedFields) ? args.changedFields : [],
      payload: {
        before: (args.before || {}) as Record<string, unknown>,
        after: after as Record<string, unknown>,
        changedFields: Array.isArray(args.changedFields) ? args.changedFields : [],
      },
    });
  }

  async listTags(user: AuthUser) {
    return this.repository.listTags({ tenantId: user.tenant_id });
  }

  async createTag(user: AuthUser, dto: CreateTagDto) {
    return this.repository.createTag({
      tenantId: user.tenant_id,
      name: dto.name.trim(),
      color: dto.color,
    });
  }

  async attachTag(user: AuthUser, cardId: string, tagId: string) {
    const userId = this.getUserId(user);
    const card = await this.repository.findCardById({ tenantId: user.tenant_id, cardId });
    if (!card) throw new NotFoundException('Card not found');

    const board = await this.repository.findBoardById({ tenantId: user.tenant_id, boardId: card.board_id });
    if (!board) throw new NotFoundException('Board not found');
    if (!this.canWriteBoard(user, board)) throw new ForbiddenException('You cannot update tags for this card');

    const updated = await this.repository.attachTagToCard({ tenantId: user.tenant_id, cardId, tagId });

    await this.repository.createCardAudit({
      tenantId: user.tenant_id,
      cardId,
      action: board_card_audit_action_enum.TAGS_UPDATED,
      createdByUserId: userId,
      metaJson: { operation: 'attach', tag_id: tagId },
    });

    return updated;
  }

  async removeTag(user: AuthUser, cardId: string, tagId: string) {
    const userId = this.getUserId(user);
    const card = await this.repository.findCardById({ tenantId: user.tenant_id, cardId });
    if (!card) throw new NotFoundException('Card not found');

    const board = await this.repository.findBoardById({ tenantId: user.tenant_id, boardId: card.board_id });
    if (!board) throw new NotFoundException('Board not found');
    if (!this.canWriteBoard(user, board)) throw new ForbiddenException('You cannot update tags for this card');

    const updated = await this.repository.removeTagFromCard({ tenantId: user.tenant_id, cardId, tagId });

    await this.repository.createCardAudit({
      tenantId: user.tenant_id,
      cardId,
      action: board_card_audit_action_enum.TAGS_UPDATED,
      createdByUserId: userId,
      metaJson: { operation: 'remove', tag_id: tagId },
    });

    return updated;
  }

  async listComments(user: AuthUser, cardId: string) {
    const card = await this.repository.findCardById({ tenantId: user.tenant_id, cardId });
    if (!card) throw new NotFoundException('Card not found');

    const board = await this.repository.findBoardById({ tenantId: user.tenant_id, boardId: card.board_id });
    if (!board) throw new NotFoundException('Board not found');
    if (!this.canReadBoard(user, board)) throw new ForbiddenException('You do not have access to this card comments');

    return this.repository.listComments({ tenantId: user.tenant_id, cardId });
  }

  async addComment(user: AuthUser, cardId: string, dto: CreateCommentDto) {
    const userId = this.getUserId(user);
    const card = await this.repository.findCardById({ tenantId: user.tenant_id, cardId });
    if (!card) throw new NotFoundException('Card not found');

    const board = await this.repository.findBoardById({ tenantId: user.tenant_id, boardId: card.board_id });
    if (!board) throw new NotFoundException('Board not found');
    if (!this.canReadBoard(user, board)) throw new ForbiddenException('You do not have access to this card');

    const comment = await this.repository.addComment({
      tenantId: user.tenant_id,
      cardId,
      userId,
      comment: dto.comment,
    });

    await this.repository.createCardAudit({
      tenantId: user.tenant_id,
      cardId,
      action: board_card_audit_action_enum.COMMENTED,
      createdByUserId: userId,
      metaJson: {
        comment_id: comment.id,
      },
    });

    return comment;
  }

  async setAssignees(user: AuthUser, cardId: string, dto: SetCardAssigneesDto) {
    const userId = this.getUserId(user);
    const card = await this.repository.findCardById({ tenantId: user.tenant_id, cardId });
    if (!card) throw new NotFoundException('Card not found');

    const board = await this.repository.findBoardById({ tenantId: user.tenant_id, boardId: card.board_id });
    if (!board) throw new NotFoundException('Board not found');
    if (!this.canWriteBoard(user, board)) throw new ForbiddenException('You cannot assign this card');

    const result = await this.repository.setCardAssignees({
      tenantId: user.tenant_id,
      cardId,
      userIds: dto.user_ids,
    });

    await this.repository.createCardAudit({
      tenantId: user.tenant_id,
      cardId,
      action: board_card_audit_action_enum.ASSIGNEES_UPDATED,
      createdByUserId: userId,
      metaJson: {
        assignees_count: dto.user_ids.length,
      },
    });

    return result;
  }
}
