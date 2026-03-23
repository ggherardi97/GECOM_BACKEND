export const AUTOMATION_TRIGGER_TYPES = ['MANUAL', 'ENTITY_EVENT', 'SCHEDULE'] as const;
export type AutomationTriggerType = (typeof AUTOMATION_TRIGGER_TYPES)[number];

export const AUTOMATION_ACTION_TYPES = [
  'UPDATE_FIELD',
  'SEND_EMAIL',
  'CREATE_TASK',
  'WEBHOOK',
  'AI_ACTION',
  'CREATE_REGISTER',
  'WHATSAPP',
] as const;
export type AutomationActionType = (typeof AUTOMATION_ACTION_TYPES)[number];

export type AutomationEventType = 'CREATE' | 'UPDATE';

export type AutomationTriggerCondition = {
  source?: 'before' | 'after';
  field?: string;
  operator?:
    | 'EQUALS'
    | 'NOT_EQUALS'
    | 'CONTAINS'
    | 'GREATER_THAN'
    | 'LESS_THAN'
    | 'GREATER_OR_EQUAL'
    | 'LESS_OR_EQUAL'
    | 'CHANGED_TO'
    | 'CHANGED_FROM'
    | 'IS_TRUE'
    | 'IS_FALSE'
    | 'NOT_EMPTY'
    | 'IS_EMPTY';
  value?: unknown;
};

export type AutomationTriggerConfig = {
  entityName?: string;
  eventType?: AutomationEventType;
  fieldChanged?: string;
  condition?: AutomationTriggerCondition;
  conditions?: AutomationTriggerCondition[];
  cron?: string;
  timezone?: string;
  [key: string]: unknown;
};

export type AutomationWorkflowTrigger = {
  type: AutomationTriggerType;
  config?: AutomationTriggerConfig;
};

export type AutomationWorkflowAction = {
  id: string;
  type: AutomationActionType;
  config?: Record<string, unknown>;
};

export type AutomationWorkflowUiNode = {
  id: string;
  x: number;
  y: number;
};

export type AutomationWorkflow = {
  version: 1;
  trigger: AutomationWorkflowTrigger;
  actions: AutomationWorkflowAction[];
  ui?: {
    nodes: AutomationWorkflowUiNode[];
  };
};

export type AutomationExecutionMode = 'MANUAL' | 'EVENT';

export type AutomationExecutionContext = {
  tenantId: string;
  userId?: string;
  automationId: string;
  entityName: string;
  recordId?: string;
  payload?: Record<string, unknown>;
  eventType?: AutomationEventType;
  executionMode: AutomationExecutionMode;
};

export type AutomationEventDispatchPayload = {
  tenantId: string;
  userId?: string;
  entityName: string;
  eventType: AutomationEventType;
  recordId?: string;
  payload?: Record<string, unknown>;
  changedFields?: string[];
};

