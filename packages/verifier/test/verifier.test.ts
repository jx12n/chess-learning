/**
 * P5 gate, refusal side: the verifier must REFUSE unsolvable, malformed
 * and off-target exercises — generate-then-verify has teeth only if the
 * verify step can say no.
 */
import { describe, expect, it } from 'vitest';
import type { Exercise, TeachingTarget } from '@chess/curriculum';
import { assertServable, servable, verifyExercise } from '@chess/verifier';

const rookCaptureTarget: TeachingTarget = {
  kinds: ['scenario'],
  pieces: ['R'],
  goalTypes: ['capture-all'],
};

function scenarioExercise(overrides: {
  id: string;
  startFEN: string;
  goal: Exercise extends never ? never : any;
  movesBudget?: number | null;
}): Exercise {
  return {
    kind: 'scenario',
    id: overrides.id,
    prompt: 'test',
    scenario: {
      id: overrides.id,
      startFEN: overrides.startFEN,
      allowed: { pieces: ['R'], moves: 'rook-lines', castling: false },
      goal: overrides.goal,
      opponent: 'none',
      movesBudget: overrides.movesBudget ?? null,
    },
  };
}

describe('the verifier refuses bad exercises (P5 gate)', () => {
  it('refuses a geometrically unsolvable Gobble (boxed-in target pawn)', async () => {
    // Black pawn a8 is walled off by White's own pawns on a7 and b8:
    // the rook can never enter a8 by file (a7 blocks) or rank (b8 blocks).
    const ex = scenarioExercise({
      id: 'unsolvable-boxed-pawn',
      startFEN: 'pP6/P7/8/8/8/8/8/7R w - - 0 1',
      goal: { type: 'capture-all', targets: 'p' },
    });
    const report = await verifyExercise(ex, rookCaptureTarget);
    expect(report.valid).toBe(true);
    expect(report.solvable).toBe(false);
    expect(servable(report)).toBe(false);
    await expect(assertServable(ex, rookCaptureTarget)).rejects.toThrow(
      /refused/,
    );
  });

  it('refuses a Race whose budget is below the shortest solution', async () => {
    const ex = scenarioExercise({
      id: 'unsolvable-budget',
      startFEN: '8/8/8/8/8/8/8/R7 w - - 0 1',
      goal: { type: 'reach-square', square: 'h8', piece: 'R' },
      movesBudget: 1, // needs 2
    });
    const report = await verifyExercise(ex);
    expect(report.solvable).toBe(false);
    expect(report.reason).toMatch(/budget/);
  });

  it('refuses an off-target exercise (wrong goal type for the node)', async () => {
    const ex = scenarioExercise({
      id: 'off-target-race',
      startFEN: '8/8/8/8/8/8/8/R7 w - - 0 1',
      goal: { type: 'reach-square', square: 'h8', piece: 'R' },
      movesBudget: 2,
    });
    const report = await verifyExercise(ex, rookCaptureTarget);
    expect(report.solvable).toBe(true); // solvable, but not what the node teaches
    expect(report.onTarget).toBe(false);
    expect(servable(report)).toBe(false);
  });

  it('refuses a malformed FEN', async () => {
    const ex = scenarioExercise({
      id: 'bad-fen',
      startFEN: 'this is not chess',
      goal: { type: 'capture-all', targets: 'p' },
    });
    const report = await verifyExercise(ex);
    expect(report.valid).toBe(false);
    expect(servable(report)).toBe(false);
  });

  it('refuses a find-square exercise pointing at a non-square', async () => {
    const ex: Exercise = {
      kind: 'find-square',
      id: 'bad-square',
      prompt: 'click j9',
      square: 'j9',
    };
    const report = await verifyExercise(ex);
    expect(report.valid).toBe(false);
    expect(servable(report)).toBe(false);
  });
});

describe('unique-solution semantics (decided: informational, not gating)', () => {
  it('a one-road race is unique; an open-board race is not', async () => {
    // Rook a1 in a corridor: own pawns wall the b-file; only a1→a8.
    const corridor = scenarioExercise({
      id: 'corridor',
      startFEN: '8/8/8/8/8/8/1P6/RP6 w - - 0 1',
      goal: { type: 'reach-square', square: 'a8', piece: 'R' },
      movesBudget: 1,
    });
    const corridorReport = await verifyExercise(corridor);
    expect(corridorReport.solvable).toBe(true);
    expect(corridorReport.unique).toBe(true);

    // Open board, two-move target: a1→a8→h8 and a1→h1→h8 both work.
    const open = scenarioExercise({
      id: 'open',
      startFEN: '8/8/8/8/8/8/8/R7 w - - 0 1',
      goal: { type: 'reach-square', square: 'h8', piece: 'R' },
      movesBudget: 2,
    });
    const openReport = await verifyExercise(open);
    expect(openReport.solvable).toBe(true);
    expect(openReport.unique).toBe(false);
    // Uniqueness does not gate servability for mini-games.
    expect(servable(openReport)).toBe(true);
  });
});
