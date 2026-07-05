/**
 * stateWhere produces only router-reachable states: it simulates a
 * perfect learner through the public model API, so a jump target is
 * exactly where the outer loop would land a real learner.
 */
import { describe, expect, it } from 'vitest';
import {
  counterLearnerModel as model,
  nextStep,
  stateWhere,
  theBasics,
} from '@chess/curriculum';

const curriculum = theBasics();

describe('stateWhere (dev/test state synthesis)', () => {
  it('lands fresh on a node: its first exercise, practice phase', () => {
    const state = stateWhere(curriculum, model, { nodeId: 'rook-movement' });
    const step = nextStep(curriculum, model, state);
    expect(step).toMatchObject({
      done: false,
      phase: 'practice',
      node: { id: 'rook-movement' },
      exercise: { id: 'rook-race-01' },
    });
    // Prereqs really are mastered, not forged.
    const board = curriculum.nodes.find((n) => n.id === 'board-orientation')!;
    expect(model.mastered(state, board)).toBe(true);
  });

  it('lands on a node checkpoint: practice mastered, assessment served', () => {
    const state = stateWhere(curriculum, model, {
      nodeId: 'rook-capture',
      phase: 'assessment',
    });
    const step = nextStep(curriculum, model, state);
    expect(step).toMatchObject({
      done: false,
      phase: 'assessment',
      exercise: { id: 'rook-gobble-check' },
    });
  });

  it('lands at the start of a later day with every prior node mastered', () => {
    const day5first = curriculum.days!.find((d) => d.day === 5)!.nodes[0]!;
    const state = stateWhere(curriculum, model, { nodeId: day5first });
    const step = nextStep(curriculum, model, state);
    expect(!step.done && step.node.id).toBe('pawn-march');
    for (const id of ['rook-capture', 'bishop-capture', 'queen-capture', 'knight-capture']) {
      const node = curriculum.nodes.find((n) => n.id === id)!;
      expect(model.mastered(state, node)).toBe(true);
    }
  });

  it('produces the band-complete state', () => {
    const state = stateWhere(curriculum, model, { done: true });
    expect(nextStep(curriculum, model, state)).toEqual({ done: true });
  });

  it('throws on unreachable targets (stub nodes) instead of forging state', () => {
    expect(() => stateWhere(curriculum, model, { nodeId: 'basic-mates' })).toThrow(
      /unreachable/,
    );
  });

  it('rejects an empty match', () => {
    expect(() => stateWhere(curriculum, model, {})).toThrow(/nodeId or done/);
  });

  it('round-trips through serialization (the e2e seeding path)', () => {
    const state = stateWhere(curriculum, model, { nodeId: 'bishop-movement' });
    const revived = model.deserialize(model.serialize(state));
    const step = nextStep(curriculum, model, revived);
    expect(!step.done && step.node.id).toBe('bishop-movement');
  });
});
