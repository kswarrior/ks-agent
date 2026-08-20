import { AgentState } from '@ks-agent/types';

export type StateEvent =
  | { type: 'USER_REQUEST_RECEIVED' }
  | { type: 'PLAN_CREATED' }
  | { type: 'EXPLORATION_COMPLETE' }
  | { type: 'IMPLEMENTATION_COMPLETE' }
  | { type: 'TESTS_PASSED' }
  | { type: 'TESTS_FAILED' }
  | { type: 'REVIEW_APPROVED' }
  | { type: 'REVIEW_CHANGES_REQUIRED' }
  | { type: 'FIX_COMPLETE' }
  | { type: 'MAX_ITERATIONS_REACHED' }
  | { type: 'ERROR' }
  | { type: 'USER_APPROVAL_REQUIRED' }
  | { type: 'USER_APPROVED' }
  | { type: 'USER_DENIED' }
  | { type: 'RESUME' };

export interface StateTransition {
  from: AgentState;
  event: StateEvent['type'];
  to: AgentState;
  guard?: (context: Record<string, unknown>) => boolean;
}

const TRANSITIONS: StateTransition[] = [
  { from: AgentState.IDLE, event: 'USER_REQUEST_RECEIVED', to: AgentState.PLANNING },
  { from: AgentState.PLANNING, event: 'PLAN_CREATED', to: AgentState.EXPLORING },
  { from: AgentState.EXPLORING, event: 'EXPLORATION_COMPLETE', to: AgentState.IMPLEMENTING },
  { from: AgentState.IMPLEMENTING, event: 'IMPLEMENTATION_COMPLETE', to: AgentState.TESTING },
  { from: AgentState.TESTING, event: 'TESTS_PASSED', to: AgentState.REVIEWING },
  { from: AgentState.TESTING, event: 'TESTS_FAILED', to: AgentState.FIXING },
  { from: AgentState.REVIEWING, event: 'REVIEW_APPROVED', to: AgentState.COMPLETED },
  { from: AgentState.REVIEWING, event: 'REVIEW_CHANGES_REQUIRED', to: AgentState.FIXING },
  { from: AgentState.FIXING, event: 'FIX_COMPLETE', to: AgentState.RETESTING },
  { from: AgentState.RETESTING, event: 'TESTS_PASSED', to: AgentState.REVIEWING },
  { from: AgentState.RETESTING, event: 'TESTS_FAILED', to: AgentState.FIXING },
  { from: AgentState.RETESTING, event: 'MAX_ITERATIONS_REACHED', to: AgentState.WAITING_FOR_USER },
  { from: AgentState.FIXING, event: 'MAX_ITERATIONS_REACHED', to: AgentState.WAITING_FOR_USER },
  { from: AgentState.FIXING, event: 'TESTS_FAILED', to: AgentState.RETESTING },
  { from: AgentState.REVIEWING, event: 'MAX_ITERATIONS_REACHED', to: AgentState.WAITING_FOR_USER },
  { from: AgentState.TESTING, event: 'ERROR', to: AgentState.FAILED },
  { from: AgentState.PLANNING, event: 'ERROR', to: AgentState.FAILED },
  { from: AgentState.EXPLORING, event: 'ERROR', to: AgentState.FAILED },
  { from: AgentState.IMPLEMENTING, event: 'ERROR', to: AgentState.FAILED },
  { from: AgentState.REVIEWING, event: 'ERROR', to: AgentState.FAILED },
  { from: AgentState.FIXING, event: 'ERROR', to: AgentState.FAILED },
  { from: AgentState.RETESTING, event: 'ERROR', to: AgentState.FAILED },
  { from: AgentState.TESTING, event: 'USER_APPROVAL_REQUIRED', to: AgentState.WAITING_FOR_USER },
  { from: AgentState.IMPLEMENTING, event: 'USER_APPROVAL_REQUIRED', to: AgentState.WAITING_FOR_USER },
  { from: AgentState.WAITING_FOR_USER, event: 'USER_APPROVED', to: AgentState.TESTING },
  { from: AgentState.WAITING_FOR_USER, event: 'RESUME', to: AgentState.TESTING },
  { from: AgentState.WAITING_FOR_USER, event: 'ERROR', to: AgentState.FAILED }
];

export class AgentStateMachine {
  private currentState: AgentState = AgentState.IDLE;
  private context: Record<string, unknown> = {};
  private onTransition?: (from: AgentState, to: AgentState, event: string) => void;

  constructor(initialState: AgentState = AgentState.IDLE, onTransition?: (from: AgentState, to: AgentState, event: string) => void) {
    this.currentState = initialState;
    this.onTransition = onTransition;
  }

  getState(): AgentState {
    return this.currentState;
  }

  setState(state: AgentState): void {
    this.currentState = state;
  }

  setContext(key: string, value: unknown): void {
    this.context[key] = value;
  }

  getContext(): Record<string, unknown> {
    return { ...this.context };
  }

  transition(event: StateEvent): boolean {
    const matches = TRANSITIONS.filter(t =>
      t.from === this.currentState && t.event === event.type
    );

    if (matches.length === 0) {
      return false;
    }

    // Use first transition that passes its guard
    for (const transition of matches) {
      if (transition.guard && !transition.guard(this.context)) {
        continue;
      }

      const from = this.currentState;
      this.currentState = transition.to;
      this.onTransition?.call(this, from, transition.to, event.type);
      return true;
    }

    return false;
  }

  canTransition(event: StateEvent['type']): boolean {
    return TRANSITIONS.some(t =>
      t.from === this.currentState && t.event === event
    );
  }

  getValidEvents(): string[] {
    return TRANSITIONS
      .filter(t => t.from === this.currentState)
      .map(t => t.event);
  }

  reset(): void {
    this.currentState = AgentState.IDLE;
    this.context = {};
  }
}