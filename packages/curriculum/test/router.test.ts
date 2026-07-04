/**
 * P4 gate: an empty learner is routed board-orientation → rook-movement →
 * rook-capture; prereqs are enforced; stub nodes are never served.
 */
import { describe, expect, it } from 'vitest';
import {
  counterLearnerModel as model,
  nextStep,
  theBasics,
  type LearnerState,
} from '@chess/curriculum';

/** Complete a node's practice + assessment with all-correct answers. */
function masterCurrentNode(state: LearnerState): LearnerState {
  const curriculum = theBasics();
  const first = nextStep(curriculum, model, state);
  if (first.done) throw new Error('nothing to master');
  const nodeId = first.node.id;
  for (let guard = 0; guard < 50; guard++) {
    const step = nextStep(curriculum, model, state);
    if (step.done || step.node.id !== nodeId) return state;
    state = model.observe(state, {
      nodeId: step.node.id,
      exerciseId: step.exercise.id,
      correct: true,
      phase: step.phase,
    });
  }
  throw new Error(`node '${nodeId}' did not complete in 50 attempts`);
}

describe('outer loop routing (P4 gate)', () => {
  it('routes an empty learner to board-orientation first', () => {
    const step = nextStep(theBasics(), model, model.init());
    expect(step.done).toBe(false);
    if (!step.done) {
      expect(step.node.id).toBe('board-orientation');
      expect(step.phase).toBe('practice');
      expect(step.exercise.kind).toBe('find-square');
    }
  });

  it('routes A → B → C as each node is mastered, then Day 1 is done', () => {
    let state = model.init();
    const served: string[] = [];
    for (let i = 0; i < 3; i++) {
      const step = nextStep(theBasics(), model, state);
      if (step.done) break;
      served.push(step.node.id);
      state = masterCurrentNode(state);
    }
    expect(served).toEqual([
      'board-orientation',
      'rook-movement',
      'rook-capture',
    ]);
    // Everything after Day 1 is stubbed, so the band reports done.
    expect(nextStep(theBasics(), model, state)).toEqual({ done: true });
  });

  it('never serves rook nodes before their prereqs are mastered', () => {
    const curriculum = theBasics();
    let state = model.init();
    // Fail a few attempts — still stuck on board-orientation.
    for (let i = 0; i < 4; i++) {
      const step = nextStep(curriculum, model, state);
      if (step.done) throw new Error('unexpected completion');
      expect(step.node.id).toBe('board-orientation');
      state = model.observe(state, {
        nodeId: step.node.id,
        exerciseId: step.exercise.id,
        correct: false,
        phase: step.phase,
      });
    }
  });

  it('requires the assessment after practice mastery', () => {
    const curriculum = theBasics();
    let state = model.init();
    // Four correct practice answers meet the 4-of-5 rule...
    for (let i = 0; i < 4; i++) {
      const step = nextStep(curriculum, model, state);
      if (step.done) throw new Error('unexpected completion');
      expect(step.phase).toBe('practice');
      state = model.observe(state, {
        nodeId: step.node.id,
        exerciseId: step.exercise.id,
        correct: true,
        phase: 'practice',
      });
    }
    // ...then the same node serves its assessment, not the next node.
    const check = nextStep(curriculum, model, state);
    expect(check.done).toBe(false);
    if (!check.done) {
      expect(check.node.id).toBe('board-orientation');
      expect(check.phase).toBe('assessment');
      expect(check.exercise.id).toBe('fs-check-g5');
    }
  });

  it('mastery survives a serialize/deserialize round trip', () => {
    let state = model.init();
    state = masterCurrentNode(state);
    const revived = model.deserialize(model.serialize(state));
    const step = nextStep(theBasics(), model, revived);
    expect(step.done).toBe(false);
    if (!step.done) expect(step.node.id).toBe('rook-movement');
  });

  it('the mastery window is sliding: early failures age out', () => {
    const curriculum = theBasics();
    let state = model.init();
    const answers = [false, false, true, true, true, true];
    for (const correct of answers) {
      const step = nextStep(curriculum, model, state);
      if (step.done) throw new Error('unexpected completion');
      state = model.observe(state, {
        nodeId: step.node.id,
        exerciseId: step.exercise.id,
        correct,
        phase: step.phase,
      });
    }
    // Last 5 attempts contain 4 correct → practice mastered → assessment.
    const step = nextStep(curriculum, model, state);
    if (step.done) throw new Error('unexpected completion');
    expect(step.phase).toBe('assessment');
  });
});

describe('practice progress (display scale)', () => {
  it('counts corrects in the sliding window, clamped to mastery.n', () => {
    const curriculum = theBasics();
    const node = curriculum.nodes.find((n) => n.id === 'board-orientation')!;
    let state = model.init();
    expect(model.practiceProgress(state, node)).toBe(0);

    // A failure earns no credit.
    state = model.observe(state, {
      nodeId: node.id,
      exerciseId: 'fs-e4',
      correct: false,
      phase: 'practice',
    });
    expect(model.practiceProgress(state, node)).toBe(0);

    // Three corrects → three credits (n=4 not yet reached).
    for (const ex of ['fs-a1', 'fs-h8', 'fs-c6']) {
      state = model.observe(state, {
        nodeId: node.id,
        exerciseId: ex,
        correct: true,
        phase: 'practice',
      });
    }
    expect(model.practiceProgress(state, node)).toBe(3);

    // The window slides (m=5): pile on failures until the corrects age out.
    for (let i = 0; i < 5; i++) {
      state = model.observe(state, {
        nodeId: node.id,
        exerciseId: 'fs-e4',
        correct: false,
        phase: 'practice',
      });
    }
    expect(model.practiceProgress(state, node)).toBe(0);
  });
});

describe('curriculum data integrity', () => {
  it('the-basics validates and has exactly the Day 1 nodes active', () => {
    const curriculum = theBasics();
    const active = curriculum.nodes.filter((n) => n.status === 'active');
    expect(active.map((n) => n.id)).toEqual([
      'board-orientation',
      'rook-movement',
      'rook-capture',
    ]);
    // The rest of the band is present but stubbed.
    expect(curriculum.nodes.length).toBeGreaterThan(8);
  });
});
