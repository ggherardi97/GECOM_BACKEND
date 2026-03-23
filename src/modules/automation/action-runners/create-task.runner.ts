import { Injectable } from '@nestjs/common';
import { IncidentPriority, TaskStatus, TaskTypeChannel } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AutomationActionRunner, ActionRunnerArgs } from './automation-action-runner.interface';
import { renderTemplateValue } from './template.util';

@Injectable()
export class CreateTaskActionRunner implements AutomationActionRunner {
  readonly type = 'CREATE_TASK' as const;

  constructor(private readonly prisma: PrismaService) {}

  async run({ action, context, accumulatedOutput }: ActionRunnerArgs): Promise<Record<string, unknown>> {
    const config = (action.config ?? {}) as Record<string, unknown>;
    const templateSource = {
      tenantId: context.tenantId,
      userId: context.userId,
      recordId: context.recordId,
      entityName: context.entityName,
      payload: context.payload ?? {},
      output: accumulatedOutput,
    } as Record<string, unknown>;

    const incidentId = this.resolveIncidentId(config, context, templateSource);
    if (!incidentId) {
      return {
        simulated: true,
        message: 'CREATE_TASK ignorado porque não foi possível resolver o incidente de contexto.',
      };
    }

    const title = renderTemplateValue(String(config.title ?? 'Tarefa automática'), templateSource).trim();
    const description = renderTemplateValue(String(config.description ?? ''), templateSource).trim() || null;
    const dueAt = this.parseDate(renderTemplateValue(String(config.due_at ?? ''), templateSource));
    const startedAt = this.parseDate(renderTemplateValue(String(config.started_at ?? ''), templateSource));
    const completedAt = this.parseDate(renderTemplateValue(String(config.completed_at ?? ''), templateSource));
    const estimatedMinutes = this.parseInt(renderTemplateValue(String(config.estimated_minutes ?? ''), templateSource));
    const actualMinutes = this.parseInt(renderTemplateValue(String(config.actual_minutes ?? ''), templateSource));
    const assignedToUserId = this.resolveUuid(renderTemplateValue(String(config.assigned_to_user_id ?? ''), templateSource));
    const taskTypeId = this.resolveUuid(renderTemplateValue(String(config.task_type_id ?? ''), templateSource));
    const status = this.parseStatus(String(config.status ?? 'OPEN'));
    const priority = this.parsePriority(String(config.priority ?? 'NORMAL'));
    const type = this.parseType(String(config.channel ?? config.type ?? 'INTERNAL'));
    const creatorUserId =
      this.resolveUuid(String(context.userId || '')) ||
      assignedToUserId ||
      this.resolveUuid(String(((context.payload || {}) as any)?.after?.opened_by_user_id || '')) ||
      this.resolveUuid(String(((context.payload || {}) as any)?.after?.owner_user_id || ''));

    if (!creatorUserId) {
      return {
        simulated: true,
        message: 'CREATE_TASK ignorado porque não foi possível resolver created_by_user_id.',
      };
    }

    const task = await this.prisma.service_tasks.create({
      data: {
        tenant_id: context.tenantId,
        incident_id: incidentId,
        task_type_id: taskTypeId || null,
        title: title || 'Tarefa automática',
        description,
        type,
        status,
        priority,
        assigned_to_user_id: assignedToUserId || null,
        due_at: dueAt,
        started_at: startedAt,
        completed_at: completedAt,
        estimated_minutes: estimatedMinutes,
        actual_minutes: actualMinutes,
        created_by_user_id: creatorUserId,
      },
      include: {
        task_type: true,
        assigned_to_user: true,
      },
    });

    return {
      simulated: false,
      message: 'Tarefa criada com sucesso.',
      task,
    };
  }

  private resolveIncidentId(
    config: Record<string, unknown>,
    context: ActionRunnerArgs['context'],
    templateSource: Record<string, unknown>,
  ): string | null {
    const explicit = this.resolveUuid(renderTemplateValue(String(config.incident_id ?? ''), templateSource));
    if (explicit) return explicit;
    if (String(context.entityName || '').trim().toLowerCase() === 'incidents' && context.recordId) return String(context.recordId);

    const payload = (context.payload || {}) as Record<string, any>;
    const after = (payload.after || payload) as Record<string, any>;
    const incidentId = after?.incident_id || after?.id;
    return this.resolveUuid(String(incidentId || ''));
  }

  private parseType(value: string): TaskTypeChannel {
    const normalized = String(value || 'INTERNAL').trim().toUpperCase();
    return (Object.values(TaskTypeChannel).includes(normalized as TaskTypeChannel)
      ? normalized
      : TaskTypeChannel.INTERNAL) as TaskTypeChannel;
  }

  private parseStatus(value: string): TaskStatus {
    const normalized = String(value || 'OPEN').trim().toUpperCase();
    return (Object.values(TaskStatus).includes(normalized as TaskStatus) ? normalized : TaskStatus.OPEN) as TaskStatus;
  }

  private parsePriority(value: string): IncidentPriority {
    const normalized = String(value || 'NORMAL').trim().toUpperCase();
    return (Object.values(IncidentPriority).includes(normalized as IncidentPriority)
      ? normalized
      : IncidentPriority.NORMAL) as IncidentPriority;
  }

  private resolveUuid(value: string | null | undefined): string | null {
    const raw = String(value || '').trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw) ? raw : null;
  }

  private parseDate(value: string): Date | null {
    const raw = String(value || '').trim();
    if (!raw) return null;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private parseInt(value: string): number | null {
    const raw = String(value || '').trim();
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : null;
  }
}
