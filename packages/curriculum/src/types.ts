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
  goalTypes?: Array<'capture-all' | 'reach-square'>;
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
}

/** An exercise the play surface can serve. */
export type Exercise =
  | {
      kind: 'find-square';
      id: string;
      prompt: string;
      /** The square the learner must click, e.g. "e4". */
      square: string;
    }
  | {
      kind: 'scenario';
      id: string;
      prompt: string;
      scenario: Scenario;
    };

export interface Curriculum {
  band: string;
  title: string;
  nodes: SkillNode[];
  exercises: Exercise[];
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
