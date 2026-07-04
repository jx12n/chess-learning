/**
 * @chess/curriculum — curriculum as data, plus the machinery that walks it:
 * schema types, structural validation, the outer tutoring loop (router)
 * and the learner-model stub.
 */

export type {
  AttemptEvent,
  Curriculum,
  Exercise,
  LearnerModel,
  LearnerState,
  MasteryRule,
  SkillNode,
  TeachingTarget,
} from './types.js';

export { counterLearnerModel } from './learner.js';
export {
  exerciseById,
  nextStep,
  validateCurriculum,
  type NextStep,
} from './router.js';

import type { Curriculum } from './types.js';
import { validateCurriculum } from './router.js';
import rawTheBasics from '../data/the-basics.json';

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

/** The Basics band (Day 1 nodes active, the rest stubbed). */
export function theBasics(): Curriculum {
  return loadCurriculum(rawTheBasics);
}
