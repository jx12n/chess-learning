/**
 * Outer tutoring loop: decide what the learner sees next.
 *
 * Routing rule: walk the band's nodes in authored order; serve the first
 * ACTIVE node that is not yet mastered and whose prereqs are all
 * mastered. Within a node: cycle its practice exercises until the
 * mastery rule is met, then serve the assessment (if any) until passed.
 * Stub nodes are never served, and they block their descendants —
 * unauthored content cannot be routed past.
 */

import type {
  Curriculum,
  Exercise,
  LearnerModel,
  LearnerState,
  SkillNode,
} from './types.js';

export type NextStep =
  | { done: true }
  | {
      done: false;
      node: SkillNode;
      exercise: Exercise;
      phase: 'practice' | 'assessment';
    };

export function exerciseById(curriculum: Curriculum, id: string): Exercise {
  const found = curriculum.exercises.find((e) => e.id === id);
  if (!found) throw new Error(`unknown exercise '${id}'`);
  return found;
}

function isAvailable(
  node: SkillNode,
  curriculum: Curriculum,
  model: LearnerModel,
  state: LearnerState,
): boolean {
  return node.prereqs.every((id) => {
    const prereq = curriculum.nodes.find((n) => n.id === id);
    if (!prereq) throw new Error(`node '${node.id}' has unknown prereq '${id}'`);
    return prereq.status === 'active' && model.mastered(state, prereq);
  });
}

export function nextStep(
  curriculum: Curriculum,
  model: LearnerModel,
  state: LearnerState,
): NextStep {
  for (const node of curriculum.nodes) {
    if (node.status !== 'active') continue;
    if (model.mastered(state, node)) continue;
    if (!isAvailable(node, curriculum, model, state)) continue;

    if (!model.practiceMastered(state, node)) {
      if (node.exercises.length === 0) {
        throw new Error(`active node '${node.id}' has no exercises`);
      }
      const i = model.practiceAttempts(state, node.id) % node.exercises.length;
      const id = node.exercises[i]!;
      return {
        done: false,
        node,
        exercise: exerciseById(curriculum, id),
        phase: 'practice',
      };
    }
    if (node.assessment !== undefined) {
      return {
        done: false,
        node,
        exercise: exerciseById(curriculum, node.assessment),
        phase: 'assessment',
      };
    }
    // Practice mastered, no assessment: mastered() should have been true.
    throw new Error(`node '${node.id}' mastery state is inconsistent`);
  }
  return { done: true };
}

/** Structural validation of a curriculum: run at load time and in CI. */
export function validateCurriculum(curriculum: Curriculum): string[] {
  const problems: string[] = [];
  const nodeIds = new Set<string>();
  const exerciseIds = new Set<string>();

  for (const e of curriculum.exercises) {
    if (exerciseIds.has(e.id)) problems.push(`duplicate exercise id '${e.id}'`);
    exerciseIds.add(e.id);
  }
  for (const n of curriculum.nodes) {
    if (nodeIds.has(n.id)) problems.push(`duplicate node id '${n.id}'`);
    nodeIds.add(n.id);
  }
  for (const n of curriculum.nodes) {
    for (const p of n.prereqs) {
      if (!nodeIds.has(p)) problems.push(`node '${n.id}': unknown prereq '${p}'`);
    }
    const refs = [...n.exercises, ...(n.assessment ? [n.assessment] : [])];
    for (const id of refs) {
      if (!exerciseIds.has(id)) {
        problems.push(`node '${n.id}': unknown exercise '${id}'`);
      }
    }
    if (n.status === 'active' && n.exercises.length === 0) {
      problems.push(`active node '${n.id}' has no exercises`);
    }
    if (n.mastery.n > n.mastery.m || n.mastery.n < 1) {
      problems.push(`node '${n.id}': mastery rule n=${n.mastery.n}, m=${n.mastery.m} is unsatisfiable`);
    }
  }

  // Cycle check (DFS over prereq edges).
  const visiting = new Set<string>();
  const done = new Set<string>();
  const byId = new Map(curriculum.nodes.map((n) => [n.id, n]));
  const visit = (id: string): boolean => {
    if (done.has(id)) return true;
    if (visiting.has(id)) return false;
    visiting.add(id);
    for (const p of byId.get(id)?.prereqs ?? []) {
      if (!visit(p)) return false;
    }
    visiting.delete(id);
    done.add(id);
    return true;
  };
  for (const n of curriculum.nodes) {
    if (!visit(n.id)) {
      problems.push(`prereq cycle involving node '${n.id}'`);
      break;
    }
  }
  return problems;
}
