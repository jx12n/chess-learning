/**
 * State synthesis for dev tooling and tests: walk a simulated perfect
 * learner through the band until the router serves a step matching
 * `match`, and return that learner's state.
 *
 * Only the public model API (init / observe / nextStep) is driven, so:
 * - every state produced is one a real learner could reach — nothing
 *   is forged, and unreachable targets (stub nodes) throw;
 * - it keeps working unchanged when the learner model is replaced
 *   (BKT or richer): mastery is observed, never fabricated.
 */

import { nextStep } from './router.js';
import type { Curriculum, LearnerModel, LearnerState } from './types.js';

export interface StepMatch {
  /** Land on this node's first served step (narrow with `phase`). */
  nodeId?: string;
  /** Land on this phase of the node (requires `nodeId`). */
  phase?: 'practice' | 'assessment';
  /** Land past the last node: the band-complete state. */
  done?: boolean;
}

/** Guard against unreachable targets; generous for any sane band size. */
const MAX_STEPS = 1000;

export function stateWhere(
  curriculum: Curriculum,
  model: LearnerModel,
  match: StepMatch,
): LearnerState {
  if (match.done !== true && match.nodeId === undefined) {
    throw new Error('stateWhere: match needs a nodeId or done: true');
  }
  let state = model.init();
  for (let i = 0; i < MAX_STEPS; i++) {
    const step = nextStep(curriculum, model, state);
    if (step.done) {
      if (match.done === true) return state;
      throw new Error(
        `stateWhere: band completed before serving ${JSON.stringify(match)} — unreachable target (stub node or wrong phase?)`,
      );
    }
    if (
      match.done !== true &&
      step.node.id === match.nodeId &&
      (match.phase === undefined || step.phase === match.phase)
    ) {
      return state;
    }
    state = model.observe(state, {
      nodeId: step.node.id,
      exerciseId: step.exercise.id,
      correct: true,
      phase: step.phase,
    });
  }
  throw new Error(
    `stateWhere: no step matching ${JSON.stringify(match)} within ${MAX_STEPS} simulated attempts`,
  );
}
