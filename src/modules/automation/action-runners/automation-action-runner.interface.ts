import { AutomationWorkflowAction } from '../automation.types';
import { AutomationExecutionContext } from '../automation.types';

export type ActionRunnerArgs = {
  action: AutomationWorkflowAction;
  context: AutomationExecutionContext;
  accumulatedOutput: Record<string, unknown>;
};

export interface AutomationActionRunner {
  readonly type: AutomationWorkflowAction['type'];
  run(args: ActionRunnerArgs): Promise<Record<string, unknown>>;
}

