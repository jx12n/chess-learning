/**
 * P5/P6 gate, curriculum side: EVERY exercise referenced by an active
 * node of the band is proven valid, solvable and on-target by search
 * over the truth core. This suite is also wired up as
 * `pnpm verify:curriculum` — the CI-time incarnation of the serve-time
 * reject. (assertServable also enforces minSolutionLength >= 1, so
 * degenerate already-solved content cannot slip through — F6.)
 */
import { describe, expect, it } from 'vitest';
import { exerciseById, theBasics } from '@chess/curriculum';
import { assertServable, verifyExercise } from '@chess/verifier';

const curriculum = theBasics();
const activeNodes = curriculum.nodes.filter((n) => n.status === 'active');

describe('every served exercise of the band is core-verified', () => {
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
        expect(report.minSolutionLength).toBeGreaterThanOrEqual(1);
      });
    }
  }
});

describe('authored difficulty matches the search results', () => {
  it.each([
    // Day 1 — rook
    ['rook-race-01', 2],
    ['rook-race-02', 3],
    ['rook-race-03', 3],
    ['rook-race-check', 2],
    ['rook-gobble-03', 4],
    // Day 2 — bishop
    ['bishop-race-01', 2],
    ['bishop-race-02', 3],
    ['bishop-race-03', 3],
    ['bishop-race-check', 2],
    ['bishop-gobble-03', 3],
    // Day 3 — queen
    ['queen-race-01', 2],
    ['queen-race-02', 2],
    ['queen-race-03', 2],
    ['queen-race-check', 2],
    ['queen-gobble-03', 4],
    // Day 4 — knight
    ['knight-hop-01', 2],
    ['knight-hop-02', 1],
    ['knight-hop-03', 3],
    ['knight-hop-check', 2],
    ['knight-gobble-02', 4],
    ['knight-gobble-03', 3],
    // Day 5 — pawn
    ['pawn-march-01', 1],
    ['pawn-march-02', 3],
    ['pawn-march-03', 2],
    ['pawn-march-check', 2],
    ['pawn-gobble-02', 3],
    ['pawn-gobble-03', 4],
    // Day 6 — king
    ['king-walk-01', 3],
    ['king-walk-02', 3],
    ['king-walk-03', 4],
    ['king-walk-check', 2],
    ['king-gobble-03', 3],
    // Day 7 — values & army
    ['value-pick-01', 1],
    ['value-pick-02', 1],
    ['value-pick-03', 1],
    ['value-pick-check', 1],
    ['army-gobble-01', 4],
    ['army-gobble-02', 4],
    ['army-gobble-03', 4],
    ['army-gobble-check', 3],
  ])('%s has a shortest solution of %i moves', async (id, expected) => {
    const report = await verifyExercise(exerciseById(curriculum, id));
    expect(report.minSolutionLength).toBe(expected);
  });

  it('every budgeted scenario in the band is tight: budget equals the shortest solution', async () => {
    // A band-wide authoring property: a budget exists to teach
    // efficiency, so it always equals the proven minimum. Relax
    // per-exercise (with a comment) if a future day wants slack.
    for (const node of activeNodes) {
      const ids = [...node.exercises, ...(node.assessment ? [node.assessment] : [])];
      for (const id of ids) {
        const ex = exerciseById(curriculum, id);
        if (ex.kind !== 'scenario' || ex.scenario.movesBudget == null) continue;
        const report = await verifyExercise(ex);
        expect(
          ex.scenario.movesBudget,
          `${id}: budget ${ex.scenario.movesBudget} vs shortest ${report.minSolutionLength}`,
        ).toBe(report.minSolutionLength);
      }
    }
  });
});
