/**
 * Curriculum schema: the pedagogy side of the domain↔pedagogy seam.
 *
 * Nothing in this file knows chess. Skill graphs, mastery rules, the
 * learner model and the tutoring loops are general; the chess-specific
 * payload (scenarios, squares) lives behind the `Exercise` union and is
 * only ever interpreted by the truth core and the verifier.
 */

import type { Scenario } from '@chess/core';

/** What a node teaches — used by the verifier's on-target check. */
export interface TeachingTarget {
  /** Exercise kinds this node is allowed to serve. */
  kinds: Array<Exercise['kind']>;
  /** For scenario nodes: pieces the lesson is about (uppercase letters). */
  pieces?: string[];
  /** For scenario nodes: goal types the lesson is about. */
  goalTypes?: Array<
    | 'capture-all'
    | 'reach-square'
    | 'give-check'
    | 'checkmate'
    | 'escape-check'
    | 'survive'
  >;
}

/** Mastery rule: n correct within the last m attempts. Seam for BKT. */
export interface MasteryRule {
  type: 'n-correct-of-m';
  n: number;
  m: number;
}

export interface SkillNode {
  id: string;
  title: string;
  objective: string;
  prereqs: string[];
  /**
   * The spiral strand this node advances — a thread the curriculum
   * returns to at greater depth, band after band (see VISION.md, "The
   * shape of the journey"). Opaque to this layer: bands define their
   * own strand vocabulary in data. Strands recur; nodes never do — the
   * prereq graph stays a DAG. All-or-nothing per band (validated).
   */
  strand?: string;
  /**
   * "active" nodes are fully authored and routable; "stub" nodes shape
   * the band's DAG but cannot be served yet.
   */
  status: 'active' | 'stub';
  mastery: MasteryRule;
  teaches: TeachingTarget;
  /** Practice exercise ids, cycled until mastery. */
  exercises: string[];
  /** One-shot check served after practice mastery; must be passed once. */
  assessment?: string;
  /**
   * Inner-loop coaching copy for this node, authored as data so the play
   * surface stays free of hardcoded lesson content. Opaque strings to
   * this layer; the play surface shows them verbatim.
   */
  hints?: {
    /** Shown when the learner should pick a piece to move. */
    select?: string;
    /** Shown when the learner clicks a square the piece cannot reach. */
    illegal?: string;
  };
}

/**
 * A session-sized grouping of nodes: one "day" of lessons. Days pace the
 * band for short bursts ("stop while it's still fun") — routing itself
 * remains purely prereq/mastery-driven and never consults days.
 */
export interface DayPlan {
  /** 1-based day number, ascending across the band. */
  day: number;
  title: string;
  /** Node ids played this day, in the band's serving order. */
  nodes: string[];
  /** Celebration line shown when the day's last node is mastered. */
  wrapUp: string;
  /** One-line preview of the next day, shown with the wrap-up. */
  teaser: string;
}

/** An exercise the play surface can serve. */
export type Exercise =
  | {
      kind: 'find-square';
      id: string;
      prompt: string;
      /** The square the learner must click, e.g. "e4". */
      square: string;
      /**
       * Optional position to render behind the question (D6). When set,
       * this is a danger-spotting exercise: the FEN is authored with the
       * ENEMY to move, and `square` must hold a learner piece the enemy
       * can capture — proven by the verifier against core-generated
       * captures, never trusted from data.
       */
      fen?: string;
    }
  | {
      kind: 'scenario';
      id: string;
      prompt: string;
      scenario: Scenario;
    }
  | {
      /**
       * A full game against a named opponent (D6) — day 13's "first whole
       * game". Unverifiable-by-design for solvability: the serve gate
       * checks start-position legality and a supported opponent, nothing
       * more. The learner plays the side to move in `startFEN`.
       */
      kind: 'game';
      id: string;
      prompt: string;
      startFEN: string;
      opponent: 'greedy';
    };

export interface Curriculum {
  band: string;
  title: string;
  nodes: SkillNode[];
  exercises: Exercise[];
  /** Optional day pacing; when present, every active node belongs to one day. */
  days?: DayPlan[];
  /** Celebration copy for finishing the whole band. */
  complete?: string;
}

/**
 * Opaque learner state. Callers must not reach inside — the concrete
 * shape is an implementation detail of the learner model so it can be
 * swapped for BKT (or anything richer) without moving the callers.
 */
export type LearnerState = { readonly __brand: 'LearnerState' };

/** One observed attempt, reported by the play surface. */
export interface AttemptEvent {
  nodeId: string;
  exerciseId: string;
  correct: boolean;
  phase: 'practice' | 'assessment';
  /**
   * When the attempt happened (ms since epoch). Recorded because a
   * future retention-aware model (BKT with decay, spaced resurfacing —
   * see docs/retention-model.md) needs real attempt history, and
   * history not captured now is gone. The counter stub stores practice
   * times and reads none of them; assessments keep only pass/fail.
   */
  at?: number;
  /**
   * How long the attempt took (ms from exercise shown to the deciding
   * action). Fluency lives in speed, not just accuracy — recognition
   * time is the signature of chunking — so the retention model will
   * want this history, and history not captured now is gone. Stored by
   * the stub (practice only), read by nothing yet.
   */
  latencyMs?: number;
  /**
   * Inner-loop nudges shown during the attempt (illegal-square and
   * pick-a-piece hints). A correct answer after five nudges is not the
   * same evidence as a clean one; captured for the same reason as
   * `latencyMs`. Stored by the stub (practice only), read by nothing yet.
   */
  hintCount?: number;
}

export interface LearnerModel {
  init(): LearnerState;
  observe(state: LearnerState, event: AttemptEvent): LearnerState;
  /** Practice mastery per the node's rule (assessment not included). */
  practiceMastered(state: LearnerState, node: SkillNode): boolean;
  /** Full node mastery: practice rule met AND assessment passed (if any). */
  mastered(state: LearnerState, node: SkillNode): boolean;
  /** Number of practice attempts recorded for a node (for exercise cycling). */
  practiceAttempts(state: LearnerState, nodeId: string): number;
  /**
   * Correct answers currently credited toward the node's practice-mastery
   * rule, clamped to [0, mastery.n] — the display scale for "how far
   * along am I?". While the router serves practice this is < n; a richer
   * model (BKT) maps its own mastery estimate onto the same scale.
   */
  practiceProgress(state: LearnerState, node: SkillNode): number;
  serialize(state: LearnerState): string;
  deserialize(json: string): LearnerState;
}
