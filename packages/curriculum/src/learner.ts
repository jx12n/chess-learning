/**
 * Learner-model stub: a windowed mastery counter behind the opaque
 * `LearnerState` interface. Deliberately trivial — the seam (init /
 * observe / mastered over an opaque state) is shaped so a BKT model can
 * replace this file without touching the router or the play surface.
 */

import type {
  AttemptEvent,
  LearnerModel,
  LearnerState,
  SkillNode,
} from './types.js';

interface NodeProgress {
  /** Practice attempt outcomes, oldest first. */
  practice: boolean[];
  assessmentPassed: boolean;
}

interface StateV1 {
  version: 1;
  nodes: Record<string, NodeProgress>;
}

function reveal(state: LearnerState): StateV1 {
  return state as unknown as StateV1;
}

function conceal(state: StateV1): LearnerState {
  return state as unknown as LearnerState;
}

function progress(state: StateV1, nodeId: string): NodeProgress {
  return state.nodes[nodeId] ?? { practice: [], assessmentPassed: false };
}

export const counterLearnerModel: LearnerModel = {
  init() {
    return conceal({ version: 1, nodes: {} });
  },

  observe(state, event: AttemptEvent) {
    const s = reveal(state);
    const p = progress(s, event.nodeId);
    const next: NodeProgress =
      event.phase === 'assessment'
        ? { ...p, assessmentPassed: p.assessmentPassed || event.correct }
        : { ...p, practice: [...p.practice, event.correct] };
    return conceal({
      version: 1,
      nodes: { ...s.nodes, [event.nodeId]: next },
    });
  },

  practiceMastered(state, node: SkillNode) {
    const { n, m } = node.mastery;
    const attempts = progress(reveal(state), node.id).practice;
    const window = attempts.slice(-m);
    return window.filter(Boolean).length >= n;
  },

  mastered(state, node: SkillNode) {
    if (!this.practiceMastered(state, node)) return false;
    if (node.assessment === undefined) return true;
    return progress(reveal(state), node.id).assessmentPassed;
  },

  practiceAttempts(state, nodeId) {
    return progress(reveal(state), nodeId).practice.length;
  },

  practiceProgress(state, node) {
    const { n, m } = node.mastery;
    const window = progress(reveal(state), node.id).practice.slice(-m);
    return Math.min(n, window.filter(Boolean).length);
  },

  serialize(state) {
    return JSON.stringify(reveal(state));
  },

  deserialize(json) {
    const parsed = JSON.parse(json) as StateV1;
    if (parsed.version !== 1 || typeof parsed.nodes !== 'object') {
      throw new Error('unrecognized learner state');
    }
    return conceal(parsed);
  },
};
