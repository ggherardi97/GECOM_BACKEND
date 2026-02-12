import { Injectable } from '@nestjs/common';
import {
  board_card_audit_action_enum,
  board_card_priority_enum,
  board_entity_type_enum,
  Prisma,
  view_visibility_enum,
} from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class KanbanRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listBoards(params: { tenantId: string; userId: string; isPrivileged: boolean; includeInactive?: boolean }) {
    const where: Prisma.boardsWhereInput = {
      tenant_id: params.tenantId,
      ...(params.includeInactive ? {} : { is_active: true }),
      ...(params.isPrivileged
        ? {}
        : {
            OR: [
              { owner_user_id: params.userId },
              { visibility: view_visibility_enum.PUBLIC },
              { visibility: view_visibility_enum.SHARED },
            ],
          }),
    };

    return this.prisma.boards.findMany({
      where,
      orderBy: [{ updated_at: 'desc' }],
      include: {
        owner_user: { select: { id: true, full_name: true, email: true } },
        _count: { select: { columns: true, cards: true } },
      },
    });
  }

  async findBoardById(params: { tenantId: string; boardId: string }) {
    return this.prisma.boards.findFirst({
      where: { id: params.boardId, tenant_id: params.tenantId },
      include: {
        owner_user: { select: { id: true, full_name: true, email: true } },
        columns: {
          orderBy: [{ sort_order: 'asc' }],
          include: {
            cards: {
              orderBy: [{ sort_order: 'asc' }],
              include: {
                assigned_to_user: { select: { id: true, full_name: true, email: true } },
                created_by_user: { select: { id: true, full_name: true, email: true } },
                tags: {
                  include: { tag: true },
                },
                assignees: {
                  include: {
                    user: { select: { id: true, full_name: true, email: true } },
                  },
                },
                _count: {
                  select: {
                    comments: true,
                    audit: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  async createBoard(params: {
    tenantId: string;
    ownerUserId: string;
    name: string;
    description?: string;
    entityType?: board_entity_type_enum;
    companyId?: string;
    processId?: string;
    invoiceId?: string;
    visibility?: view_visibility_enum;
    isActive?: boolean;
    columns?: Array<{ name: string; sort_order?: number; wip_limit?: number; color?: string; is_done?: boolean }>;
  }) {
    return this.prisma.transaction(async (tx) => {
      const db = tx as any;

      const board = await db.boards.create({
        data: {
          tenant_id: params.tenantId,
          owner_user_id: params.ownerUserId,
          name: params.name,
          description: params.description ?? null,
          entity_type: params.entityType ?? board_entity_type_enum.NONE,
          company_id: params.companyId ?? null,
          process_id: params.processId ?? null,
          invoice_id: params.invoiceId ?? null,
          visibility: params.visibility ?? view_visibility_enum.PRIVATE,
          is_active: params.isActive ?? true,
        },
      });

      const columns = params.columns?.length
        ? [...params.columns]
        : [
            { name: 'A Fazer', sort_order: 0 },
            { name: 'Em Andamento', sort_order: 1 },
            { name: 'Concluido', sort_order: 2, is_done: true },
          ];

      await db.board_columns.createMany({
        data: columns.map((col, index) => ({
          tenant_id: params.tenantId,
          board_id: board.id,
          name: col.name,
          sort_order: col.sort_order ?? index,
          wip_limit: col.wip_limit ?? null,
          color: col.color ?? null,
          is_done: col.is_done ?? false,
        })),
      });

      return db.boards.findFirst({
        where: { id: board.id, tenant_id: params.tenantId },
        include: {
          columns: {
            orderBy: [{ sort_order: 'asc' }],
          },
        },
      });
    });
  }

  async updateBoard(params: { tenantId: string; boardId: string; data: Prisma.boardsUncheckedUpdateInput }) {
    const updated = await this.prisma.boards.updateMany({
      where: { id: params.boardId, tenant_id: params.tenantId },
      data: params.data,
    });

    if (updated.count === 0) return null;
    return this.findBoardById({ tenantId: params.tenantId, boardId: params.boardId });
  }

  async deactivateBoard(params: { tenantId: string; boardId: string }) {
    return this.updateBoard({
      tenantId: params.tenantId,
      boardId: params.boardId,
      data: { is_active: false, updated_at: new Date() },
    });
  }

  async createColumn(params: {
    tenantId: string;
    boardId: string;
    name: string;
    sortOrder?: number;
    wipLimit?: number;
    color?: string;
    isDone?: boolean;
  }) {
    const order =
      params.sortOrder ??
      (await this.prisma.board_columns.aggregate({
        where: { tenant_id: params.tenantId, board_id: params.boardId },
        _max: { sort_order: true },
      }).then((r) => Number(r._max.sort_order ?? -1) + 1));

    return this.prisma.board_columns.create({
      data: {
        tenant_id: params.tenantId,
        board_id: params.boardId,
        name: params.name,
        sort_order: order,
        wip_limit: params.wipLimit ?? null,
        color: params.color ?? null,
        is_done: params.isDone ?? false,
      },
    });
  }

  async findColumnById(params: { tenantId: string; columnId: string }) {
    return this.prisma.board_columns.findFirst({
      where: { id: params.columnId, tenant_id: params.tenantId },
      include: { board: true },
    });
  }

  async updateColumn(params: { tenantId: string; columnId: string; data: Prisma.board_columnsUncheckedUpdateInput }) {
    const updated = await this.prisma.board_columns.updateMany({
      where: { id: params.columnId, tenant_id: params.tenantId },
      data: params.data,
    });

    if (updated.count === 0) return null;

    return this.prisma.board_columns.findFirst({
      where: { id: params.columnId, tenant_id: params.tenantId },
    });
  }

  async deleteColumn(params: { tenantId: string; columnId: string }) {
    return this.prisma.board_columns.deleteMany({
      where: { id: params.columnId, tenant_id: params.tenantId },
    });
  }

  async createCard(params: {
    tenantId: string;
    boardId: string;
    columnId: string;
    title: string;
    description?: string;
    priority?: board_card_priority_enum;
    dueDate?: Date;
    startDate?: Date;
    sortOrder?: number;
    createdByUserId: string;
    assignedToUserId?: string;
    companyId?: string;
    processId?: string;
    invoiceId?: string;
    relatedTable?: string;
    relatedId?: string;
    assigneeUserIds?: string[];
  }) {
    return this.prisma.transaction(async (tx) => {
      const db = tx as any;

      const maxOrder = await db.board_cards.aggregate({
        where: {
          tenant_id: params.tenantId,
          board_id: params.boardId,
          column_id: params.columnId,
        },
        _max: { sort_order: true },
      });

      const card = await db.board_cards.create({
        data: {
          tenant_id: params.tenantId,
          board_id: params.boardId,
          column_id: params.columnId,
          title: params.title,
          description: params.description ?? null,
          priority: params.priority ?? board_card_priority_enum.MEDIUM,
          due_date: params.dueDate ?? null,
          start_date: params.startDate ?? null,
          sort_order: params.sortOrder ?? Number(maxOrder._max.sort_order ?? -1) + 1,
          created_by_user_id: params.createdByUserId,
          assigned_to_user_id: params.assignedToUserId ?? null,
          company_id: params.companyId ?? null,
          process_id: params.processId ?? null,
          invoice_id: params.invoiceId ?? null,
          related_table: params.relatedTable ?? null,
          related_id: params.relatedId ?? null,
        },
      });

      const assignees = Array.from(new Set(params.assigneeUserIds ?? []));
      if (assignees.length > 0) {
        await db.board_card_assignees.createMany({
          data: assignees.map((userId) => ({
            tenant_id: params.tenantId,
            card_id: card.id,
            user_id: userId,
          })),
        });
      }

      return db.board_cards.findFirst({
        where: { id: card.id, tenant_id: params.tenantId },
        include: {
          tags: { include: { tag: true } },
          assignees: { include: { user: { select: { id: true, full_name: true, email: true } } } },
        },
      });
    });
  }

  async findCardById(params: { tenantId: string; cardId: string }) {
    return this.prisma.board_cards.findFirst({
      where: { id: params.cardId, tenant_id: params.tenantId },
      include: {
        board: true,
        column: true,
        tags: { include: { tag: true } },
        assignees: { include: { user: { select: { id: true, full_name: true, email: true } } } },
      },
    });
  }

  async updateCard(params: { tenantId: string; cardId: string; data: Prisma.board_cardsUncheckedUpdateInput }) {
    const updated = await this.prisma.board_cards.updateMany({
      where: { id: params.cardId, tenant_id: params.tenantId },
      data: params.data,
    });

    if (updated.count === 0) return null;
    return this.findCardById({ tenantId: params.tenantId, cardId: params.cardId });
  }

  async moveCard(params: { tenantId: string; cardId: string; targetColumnId: string; targetOrder?: number }) {
    return this.prisma.transaction(async (tx) => {
      const db = tx as any;
      const card = await db.board_cards.findFirst({
        where: { id: params.cardId, tenant_id: params.tenantId },
      });
      if (!card) return null;

      const targetColumn = await db.board_columns.findFirst({
        where: { id: params.targetColumnId, tenant_id: params.tenantId },
      });
      if (!targetColumn || targetColumn.board_id !== card.board_id) return null;

      const sourceCards: Array<{ id: string }> = await db.board_cards.findMany({
        where: {
          tenant_id: params.tenantId,
          board_id: card.board_id,
          column_id: card.column_id,
          NOT: { id: card.id },
        },
        orderBy: [{ sort_order: 'asc' }],
        select: { id: true },
      });

      const targetCards: Array<{ id: string }> = await db.board_cards.findMany({
        where: {
          tenant_id: params.tenantId,
          board_id: card.board_id,
          column_id: targetColumn.id,
          ...(card.column_id === targetColumn.id ? { NOT: { id: card.id } } : {}),
        },
        orderBy: [{ sort_order: 'asc' }],
        select: { id: true },
      });

      const requestedOrder = params.targetOrder ?? targetCards.length;
      const boundedOrder = Math.max(0, Math.min(requestedOrder, targetCards.length));
      targetCards.splice(boundedOrder, 0, { id: card.id });

      for (let i = 0; i < sourceCards.length; i += 1) {
        await db.board_cards.updateMany({
          where: { id: sourceCards[i].id, tenant_id: params.tenantId },
          data: { sort_order: i },
        });
      }

      for (let i = 0; i < targetCards.length; i += 1) {
        await db.board_cards.updateMany({
          where: { id: targetCards[i].id, tenant_id: params.tenantId },
          data: {
            sort_order: i,
            column_id: targetColumn.id,
            board_id: card.board_id,
            completed_at: targetColumn.is_done ? new Date() : null,
          },
        });
      }

      return db.board_cards.findFirst({
        where: { id: params.cardId, tenant_id: params.tenantId },
        include: {
          board: true,
          column: true,
        },
      });
    });
  }

  async deleteCard(params: { tenantId: string; cardId: string }) {
    return this.prisma.board_cards.deleteMany({
      where: { id: params.cardId, tenant_id: params.tenantId },
    });
  }

  async listTags(params: { tenantId: string }) {
    return this.prisma.board_tags.findMany({
      where: { tenant_id: params.tenantId },
      orderBy: [{ name: 'asc' }],
    });
  }

  async createTag(params: { tenantId: string; name: string; color?: string }) {
    try {
      return await this.prisma.board_tags.create({
        data: {
          tenant_id: params.tenantId,
          name: params.name,
          color: params.color ?? null,
        },
      });
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
        return this.prisma.board_tags.findFirst({
          where: { tenant_id: params.tenantId, name: params.name },
        });
      }
      throw error;
    }
  }

  async attachTagToCard(params: { tenantId: string; cardId: string; tagId: string }) {
    try {
      await this.prisma.board_card_tags.create({
        data: {
          tenant_id: params.tenantId,
          card_id: params.cardId,
          tag_id: params.tagId,
        },
      });
    } catch (error) {
      if (!(error instanceof PrismaClientKnownRequestError && error.code === 'P2002')) {
        throw error;
      }
    }

    return this.findCardById({ tenantId: params.tenantId, cardId: params.cardId });
  }

  async removeTagFromCard(params: { tenantId: string; cardId: string; tagId: string }) {
    await this.prisma.board_card_tags.deleteMany({
      where: {
        tenant_id: params.tenantId,
        card_id: params.cardId,
        tag_id: params.tagId,
      },
    });

    return this.findCardById({ tenantId: params.tenantId, cardId: params.cardId });
  }

  async addComment(params: { tenantId: string; cardId: string; userId: string; comment: string }) {
    return this.prisma.board_card_comments.create({
      data: {
        tenant_id: params.tenantId,
        card_id: params.cardId,
        user_id: params.userId,
        comment: params.comment,
      },
      include: {
        user: { select: { id: true, full_name: true, email: true } },
      },
    });
  }

  async listComments(params: { tenantId: string; cardId: string }) {
    return this.prisma.board_card_comments.findMany({
      where: {
        tenant_id: params.tenantId,
        card_id: params.cardId,
      },
      orderBy: [{ created_at: 'asc' }],
      include: {
        user: { select: { id: true, full_name: true, email: true } },
      },
    });
  }

  async setCardAssignees(params: { tenantId: string; cardId: string; userIds: string[] }) {
    const uniqueIds = Array.from(new Set(params.userIds));

    return this.prisma.transaction(async (tx) => {
      const db = tx as any;

      await db.board_card_assignees.deleteMany({
        where: {
          tenant_id: params.tenantId,
          card_id: params.cardId,
        },
      });

      if (uniqueIds.length > 0) {
        await db.board_card_assignees.createMany({
          data: uniqueIds.map((userId) => ({
            tenant_id: params.tenantId,
            card_id: params.cardId,
            user_id: userId,
          })),
        });
      }

      return db.board_card_assignees.findMany({
        where: {
          tenant_id: params.tenantId,
          card_id: params.cardId,
        },
        include: {
          user: { select: { id: true, full_name: true, email: true } },
        },
      });
    });
  }

  async createCardAudit(params: {
    tenantId: string;
    cardId: string;
    action: board_card_audit_action_enum;
    createdByUserId: string;
    fromColumnId?: string;
    toColumnId?: string;
    metaJson?: Prisma.InputJsonValue;
  }) {
    return this.prisma.board_card_audit.create({
      data: {
        tenant_id: params.tenantId,
        card_id: params.cardId,
        action: params.action,
        from_column_id: params.fromColumnId ?? null,
        to_column_id: params.toColumnId ?? null,
        ...(params.metaJson !== undefined ? { meta_json: params.metaJson } : {}),
        created_by_user_id: params.createdByUserId,
      },
    });
  }
}
