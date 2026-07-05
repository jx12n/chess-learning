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

  it('refuses a scenario whose goal is already met at the start (F6)', async () => {
    // The only black pawn is already gone — nothing to do. Solvable in
    // zero moves is not a puzzle; the serve gate must say no.
    const ex = scenarioExercise({
      id: 'degenerate-solved',
      startFEN: '8/8/8/8/8/8/8/R7 w - - 0 1',
      goal: { type: 'reach-square', square: 'a1', piece: 'R' },
    });
    const report = await verifyExercise(ex);
    expect(report.solvable).toBe(true);
    expect(report.minSolutionLength).toBe(0);
    expect(servable(report)).toBe(false);
    await expect(assertServable(ex)).rejects.toThrow(/refused/);
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

/* ---- Band 2 (decisions D1–D6): standard-rules goals, the greedy ----
 * ---- opponent folded into the search, danger-spotting, and games ---- */

describe('standard-rules goals verify and refuse (D1/D2)', () => {
  const mateTarget: TeachingTarget = { kinds: ['scenario'], goalTypes: ['checkmate'] };

  it('proves a mate-in-1 solvable and refuses a mateless one', async () => {
    const mate: Exercise = {
      kind: 'scenario',
      id: 'v-mate-in-one',
      prompt: 'test',
      scenario: {
        id: 'v-mate-in-one',
        startFEN: 'k7/8/1K6/8/8/8/8/2Q5 w - - 0 1',
        goal: { type: 'checkmate' },
        rules: 'standard',
        movesBudget: 1,
      },
    };
    const report = await verifyExercise(mate, mateTarget);
    expect(report.valid).toBe(true);
    expect(report.solvable).toBe(true);
    expect(report.minSolutionLength).toBe(1);
    expect(servable(report)).toBe(true);

    // Same material, kings apart: no mate exists in one — refused.
    const mateless: Exercise = {
      kind: 'scenario',
      id: 'v-mateless',
      prompt: 'test',
      scenario: {
        id: 'v-mateless',
        startFEN: 'k7/8/8/8/8/8/8/K1Q5 w - - 0 1',
        goal: { type: 'checkmate' },
        rules: 'standard',
        movesBudget: 1,
      },
    };
    const bad = await verifyExercise(mateless, mateTarget);
    expect(bad.solvable).toBe(false);
    expect(bad.reason).toMatch(/budget/);
    await expect(assertServable(mateless, mateTarget)).rejects.toThrow(/refused/);
  });

  it('escape-check verifies with every legal move a solution (not unique)', async () => {
    const escape: Exercise = {
      kind: 'scenario',
      id: 'v-escape',
      prompt: 'test',
      scenario: {
        id: 'v-escape',
        startFEN: '4r2k/8/8/8/8/8/8/4K3 w - - 0 1',
        goal: { type: 'escape-check' },
        rules: 'standard',
        movesBudget: 1,
      },
    };
    const report = await verifyExercise(escape, {
      kinds: ['scenario'],
      goalTypes: ['escape-check'],
    });
    expect(report.solvable).toBe(true);
    expect(report.minSolutionLength).toBe(1);
    // Four doors out of check — informational, never gating.
    expect(report.unique).toBe(false);
    expect(servable(report)).toBe(true);
  });

  it('D1 in the gate: an opponentless multi-move standard scenario is refused as malformed', async () => {
    const multi: Exercise = {
      kind: 'scenario',
      id: 'v-d1',
      prompt: 'test',
      scenario: {
        id: 'v-d1',
        startFEN: 'k7/8/1K6/8/8/8/8/2Q5 w - - 0 1',
        goal: { type: 'checkmate' },
        rules: 'standard',
        movesBudget: 2,
      },
    };
    const report = await verifyExercise(multi);
    expect(report.valid).toBe(false);
    expect(report.reason).toMatch(/movesBudget 1/);
  });
});

describe('the greedy opponent folds into the search (D3)', () => {
  const surviveTarget: TeachingTarget = {
    kinds: ['scenario'],
    pieces: ['N'],
    goalTypes: ['survive'],
  };

  it('proves a dodgeable survive scenario solvable through the replies', async () => {
    // Knight c3 vs rook a8: c3–e2–c3 dodges the deterministic rook.
    const survive: Exercise = {
      kind: 'scenario',
      id: 'v-survive',
      prompt: 'test',
      scenario: {
        id: 'v-survive',
        startFEN: 'r7/8/8/8/8/2N5/8/8 w - - 0 1',
        allowed: { pieces: ['N'] },
        goal: { type: 'survive', moves: 2 },
        opponent: 'greedy',
        movesBudget: 2,
      },
    };
    const report = await verifyExercise(survive, surviveTarget);
    expect(report.valid).toBe(true);
    expect(report.solvable).toBe(true);
    expect(report.minSolutionLength).toBe(2);
    expect(servable(report)).toBe(true);
  });

  it('a trapped opponent is maximum safety, not a dead branch', async () => {
    // The enemy rook is boxed in by kings (uncapturable scenery): zero
    // replies. The fold lands the null-reply FEN (turn passed back) and
    // the scenario must verify solvable — the core must never score a
    // stuck OPPONENT as the learner's failure.
    const trapped: Exercise = {
      kind: 'scenario',
      id: 'v-trapped',
      prompt: 'test',
      scenario: {
        id: 'v-trapped',
        startFEN: '8/8/8/8/8/5N2/K7/rK6 w - - 0 1',
        allowed: { pieces: ['N'] },
        goal: { type: 'survive', moves: 1 },
        opponent: 'greedy',
        movesBudget: 1,
      },
    };
    const report = await verifyExercise(trapped, surviveTarget);
    expect(report.solvable).toBe(true);
    expect(report.minSolutionLength).toBe(1);
    expect(servable(report)).toBe(true);
  });

  it('refuses a survive scenario where every square hangs', async () => {
    // Knight a1: both escape squares (b3, c2) are covered by the rooks.
    const doomed: Exercise = {
      kind: 'scenario',
      id: 'v-doomed',
      prompt: 'test',
      scenario: {
        id: 'v-doomed',
        startFEN: '1rr5/8/8/8/8/8/8/N7 w - - 0 1',
        allowed: { pieces: ['N'] },
        goal: { type: 'survive', moves: 1 },
        opponent: 'greedy',
        movesBudget: 1,
      },
    };
    const report = await verifyExercise(doomed, surviveTarget);
    expect(report.valid).toBe(true);
    expect(report.solvable).toBe(false);
    await expect(assertServable(doomed, surviveTarget)).rejects.toThrow(/refused/);
  });
});

describe('danger-spotting find-square proves the answer against core captures (D6)', () => {
  const dangerTarget: TeachingTarget = { kinds: ['find-square'] };
  // Black to move (the enemy); the white knight on a4 hangs to the rook.
  const dangerFEN = 'r7/8/8/8/N7/8/8/7P b - - 0 1';

  it('accepts the square the enemy can actually capture', async () => {
    const ex: Exercise = {
      kind: 'find-square',
      id: 'v-danger',
      prompt: 'test',
      square: 'a4',
      fen: dangerFEN,
    };
    const report = await verifyExercise(ex, dangerTarget);
    expect(report.valid).toBe(true);
    expect(report.solvable).toBe(true);
    // The knight is the only piece in danger — the authoring signal.
    expect(report.unique).toBe(true);
    expect(servable(report)).toBe(true);
  });

  it('refuses a square that is not actually in danger', async () => {
    const ex: Exercise = {
      kind: 'find-square',
      id: 'v-not-danger',
      prompt: 'test',
      square: 'h1',
      fen: dangerFEN,
    };
    const report = await verifyExercise(ex, dangerTarget);
    expect(report.valid).toBe(true);
    expect(report.solvable).toBe(false);
    expect(report.reason).toMatch(/not in danger/);
    await expect(assertServable(ex, dangerTarget)).rejects.toThrow(/refused/);
  });
});

describe('the game kind gates on legality and a supported opponent only (D6)', () => {
  const gameTarget: TeachingTarget = { kinds: ['game'] };

  it('serves a live standard game', async () => {
    const ex: Exercise = {
      kind: 'game',
      id: 'v-game',
      prompt: 'test',
      startFEN: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      opponent: 'greedy',
    };
    const report = await verifyExercise(ex, gameTarget);
    expect(report.valid).toBe(true);
    expect(servable(report)).toBe(true);
  });

  it('refuses a game that is already over', async () => {
    const ex: Exercise = {
      kind: 'game',
      id: 'v-dead-game',
      prompt: 'test',
      // Fool's mate: White is already checkmated.
      startFEN: 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3',
      opponent: 'greedy',
    };
    const report = await verifyExercise(ex, gameTarget);
    expect(report.valid).toBe(false);
    expect(report.reason).toMatch(/not a live game/);
  });
});
