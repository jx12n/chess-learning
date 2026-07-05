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
  /**
   * Wall-clock of each practice attempt (ms since epoch), in lockstep
   * with `practice`; `null` where no timestamp was reported. This stub
   * never reads it — it is captured for the retention model behind the
   * BKT seam (docs/retention-model.md), because attempt history not
   * recorded now cannot be recovered later. Absent in states saved
   * before timestamps existed; still version 1 on the wire.
   */
  practiceAt?: Array<number | null>;
  /**
   * Attempt duration (ms, exercise shown → deciding action), lockstep
   * with `practice` like `practiceAt`. Fluency lives in speed —
   * recognition time is the signature of chunking — and history not
   * recorded now cannot be recovered later. Captured, never read here.
   */
  practiceLatencyMs?: Array<number | null>;
  /**
   * Inner-loop nudges shown during each attempt, lockstep with
   * `practice`. A clean answer and a five-nudge answer are different
   * evidence; the distinction is the retention model's to use, and
   * this stub only preserves it. Captured, never read here.
   */
  practiceHints?: Array<number | null>;
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
    let next: NodeProgress;
    if (event.phase === 'assessment') {
      next = { ...p, assessmentPassed: p.assessmentPassed || event.correct };
    } else {
      // Lockstep by construction: index against practice[] so pre-
      // capture history pads with null and any drifted state (e.g.
      // one written by an older bundle) self-heals on the next write.
      const align = (arr: Array<number | null> | undefined, latest: number | null) => [
        ...p.practice.map((_, i) => arr?.[i] ?? null),
        latest,
      ];
      next = {
        ...p,
        practice: [...p.practice, event.correct],
        practiceAt: align(p.practiceAt, event.at ?? null),
        practiceLatencyMs: align(p.practiceLatencyMs, event.latencyMs ?? null),
        practiceHints: align(p.practiceHints, event.hintCount ?? null),
      };
    }
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
