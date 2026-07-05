/**
 * @chess/curriculum — curriculum as data, plus the machinery that walks it:
 * schema types, structural validation, the outer tutoring loop (router)
 * and the learner-model stub.
 */

export type {
  AttemptEvent,
  Curriculum,
  DayPlan,
  Exercise,
  LearnerModel,
  LearnerState,
  MasteryRule,
  SkillNode,
  TeachingTarget,
} from './types.js';

export { counterLearnerModel } from './learner.js';
export { dayForNode, dayNodes, nextDay } from './days.js';
export { stateWhere, type StepMatch } from './simulate.js';
export {
  exerciseById,
  frontier,
  nextStep,
  validateCurriculum,
  type NextStep,
} from './router.js';

import type { Curriculum } from './types.js';
import { validateCurriculum } from './router.js';
// The import attribute keeps this package loadable by plain Node ESM
// (Playwright specs, future agent tooling), not just bundlers.
import rawTheBasics from '../data/the-basics.json' with { type: 'json' };

/**
 * Load and validate a curriculum from parsed JSON. Throws on structural
 * problems — a curriculum that fails validation must never be served.
 */
export function loadCurriculum(raw: unknown): Curriculum {
  const curriculum = raw as Curriculum;
  const problems = validateCurriculum(curriculum);
  if (problems.length > 0) {
    throw new Error(`invalid curriculum:\n- ${problems.join('\n- ')}`);
  }
  return curriculum;
}

/** The Basics band: days 1–7 authored and active; the band-2 nodes
 * (`dont-hang-pieces`, `check-and-escaping-check`, `basic-mates`) shape
 * the DAG as stubs until their days are authored. */
export function theBasics(): Curriculum {
  return loadCurriculum(rawTheBasics);
}
