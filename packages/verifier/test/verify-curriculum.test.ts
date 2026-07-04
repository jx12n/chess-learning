/**
 * P5/P6 gate, curriculum side: EVERY exercise referenced by an active
 * Day 1 node is proven valid, solvable and on-target by search over the
 * truth core. This suite is also wired up as `pnpm verify:curriculum` —
 * the CI-time incarnation of the serve-time reject.
 */
import { describe, expect, it } from 'vitest';
import { exerciseById, theBasics } from '@chess/curriculum';
import { assertServable, verifyExercise } from '@chess/verifier';

const curriculum = theBasics();
const activeNodes = curriculum.nodes.filter((n) => n.status === 'active');

describe('every served Day 1 exercise is core-verified', () => {
  for (const node of activeNodes) {
    const ids = [...node.exercises, ...(node.assessment ? [node.assessment] : [])];
    for (const id of ids) {
      it(`${node.id} / ${id} is valid, solvable and on-target`, async () => {
        const report = await assertServable(
          exerciseById(curriculum, id),
          node.teaches,
        );
        expect(report.valid).toBe(true);
        expect(report.solvable).toBe(true);
        expect(report.onTarget).toBe(true);
      });
    }
  }
});

describe('authored difficulty matches the search results', () => {
  it.each([
    ['rook-race-01', 2],
    ['rook-race-02', 3],
    ['rook-race-03', 3],
    ['rook-race-check', 2],
    ['rook-gobble-03', 4],
  ])('%s has a shortest solution of %i moves', async (id, expected) => {
    const report = await verifyExercise(exerciseById(curriculum, id));
    expect(report.minSolutionLength).toBe(expected);
  });

  it('the budgeted gobble is tight: budget equals the shortest solution', async () => {
    const ex = exerciseById(curriculum, 'rook-gobble-03');
    if (ex.kind !== 'scenario') throw new Error('expected scenario');
    const report = await verifyExercise(ex);
    expect(ex.scenario.movesBudget).toBe(report.minSolutionLength);
  });
});
