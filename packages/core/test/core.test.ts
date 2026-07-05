/**
 * P0/P1 gates, exercised from Node through the SAME WASM artifact the
 * browser loads: the Rust functions are callable across the boundary,
 * and perft matches reference values at depth >= 3.
 */
import { describe, expect, it } from 'vitest';
import { CoreError, loadCore, type Scenario } from '@chess/core';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const gobble: Scenario = {
  id: 'core-test-gobble',
  startFEN: '8/2p5/8/4p3/8/1p6/8/R7 w - - 0 1',
  allowed: { pieces: ['R'], moves: 'rook-lines', castling: false },
  goal: { type: 'capture-all', targets: 'p' },
  opponent: 'none',
  movesBudget: null,
};

describe('truth core over the JS↔WASM boundary (P0 gate: callable from Node)', () => {
  it('loads and reports its version', async () => {
    const core = await loadCore();
    expect(core.version()).toBe('0.1.0');
  });

  it('perft matches reference at depth >= 3 (P1 gate)', async () => {
    const core = await loadCore();
    expect(core.perft(START, 3)).toBe(8_902);
    expect(core.perft(START, 4)).toBe(197_281);
    const kiwipete =
      'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
    expect(core.perft(kiwipete, 3)).toBe(97_862);
  });

  it('generates, applies and scores standard moves', async () => {
    const core = await loadCore();
    const moves = core.legalMoves(START);
    expect(moves).toHaveLength(20);
    const fen2 = core.apply(START, 'e2e4');
    expect(fen2).toBe(
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    );
    expect(core.result(fen2).status).toBe('ongoing');
  });

  it('narrows moves by constraints', async () => {
    const core = await loadCore();
    const knightsOnly = core.legalMoves(START, { pieces: ['N'] });
    expect(knightsOnly).toHaveLength(4);
    expect(knightsOnly.every((m) => m.piece === 'N')).toBe(true);
  });

  it('evaluate() is the deferred oracle seam', async () => {
    const core = await loadCore();
    expect(core.evaluate(START)).toEqual({ status: 'unavailable' });
  });

  it('surfaces core errors as CoreError', async () => {
    const core = await loadCore();
    expect(() => core.legalMoves('nonsense')).toThrow(CoreError);
    expect(() => core.apply(START, 'e2e5')).toThrow(/illegal move/);
  });
});

describe('scenario API over the boundary (P2 gate: Gobble playable)', () => {
  it('plays Gobble start to finish', async () => {
    const core = await loadCore();
    let fen = gobble.startFEN;
    const line = ['a1b1', 'b1b3', 'b3e3', 'e3e5', 'e5c5', 'c5c7'];
    for (const uci of line) {
      expect(core.scenarioResult(gobble, fen).status).toBe('ongoing');
      const legal = core.scenarioLegalMoves(gobble, fen);
      expect(legal.some((m) => m.uci === uci)).toBe(true);
      fen = core.scenarioApply(gobble, fen, uci);
    }
    const end = core.scenarioResult(gobble, fen);
    expect(end.status).toBe('goal-met');
    expect(end.movesUsed).toBe(6);
  });

  it('rejects constraint-illegal and chess-illegal moves alike', async () => {
    const core = await loadCore();
    // Chess-illegal for a rook: diagonal jump.
    expect(() => core.scenarioApply(gobble, gobble.startFEN, 'a1b2')).toThrow(
      CoreError,
    );
    // Legal square but occupied by nothing that can move there in one.
    expect(() => core.scenarioApply(gobble, gobble.startFEN, 'a1c7')).toThrow(
      CoreError,
    );
  });
});

/**
 * Wire-drift hardening (finding F3): the TS types in `src/types.ts`
 * mirror the serde types by hand, so drift enters silently in two
 * directions. These tests pin both. When ts-rs adoption lands (the
 * recorded follow-up), the generated types replace the mirror and the
 * deserialize direction of this suite becomes redundant; the keyset
 * assertions stay valuable as envelope-stability proof.
 */
describe('wire drift (F3): TS-side constructions marshal into serde', () => {
  it('every TS-constructible goal and opponent deserializes — refusals are validation, never parsing', async () => {
    const core = await loadCore();
    // Each entry: a scenario built from the TS types as authors and the
    // play surface build them. `accept` = the core returns a move list;
    // otherwise the error must be the named VALIDATION message — a
    // parse error ("invalid scenario") here means the wire drifted.
    const table: Array<{ s: Scenario; accept: boolean; error?: RegExp }> = [
      {
        s: {
          id: 'w-give-check',
          startFEN: '4k3/8/8/8/8/8/8/R3K3 w - - 0 1',
          allowed: { pieces: ['R'] },
          goal: { type: 'give-check' },
          rules: 'standard',
          movesBudget: 1,
        },
        accept: true,
      },
      {
        s: {
          id: 'w-checkmate',
          startFEN: 'k7/8/1K6/8/8/8/8/2Q5 w - - 0 1',
          goal: { type: 'checkmate' },
          rules: 'standard',
          movesBudget: 1,
        },
        accept: true,
      },
      {
        s: {
          id: 'w-escape',
          startFEN: '4r2k/8/8/8/8/8/8/4K3 w - - 0 1',
          goal: { type: 'escape-check' },
          rules: 'standard',
          movesBudget: 1,
        },
        accept: true,
      },
      {
        s: {
          id: 'w-survive',
          startFEN: 'r7/8/8/8/8/2N5/8/8 w - - 0 1',
          allowed: { pieces: ['N'] },
          goal: { type: 'survive', moves: 2 },
          opponent: 'greedy',
          movesBudget: 2,
        },
        accept: true,
      },
      {
        s: {
          id: 'w-engine',
          startFEN: 'r7/8/8/8/8/2N5/8/8 w - - 0 1',
          goal: { type: 'survive', moves: 1 },
          opponent: 'engine',
          movesBudget: 1,
        },
        accept: false,
        error: /deferred seam/,
      },
      {
        s: {
          id: 'w-d1',
          startFEN: 'k7/8/1K6/8/8/8/8/2Q5 w - - 0 1',
          goal: { type: 'checkmate' },
          rules: 'standard',
          movesBudget: 2,
        },
        accept: false,
        error: /movesBudget 1/,
      },
      {
        s: {
          id: 'w-wrong-model',
          startFEN: '4k3/8/8/8/8/8/8/R3K3 w - - 0 1',
          goal: { type: 'give-check' },
          movesBudget: 1,
        },
        accept: false,
        error: /standard/,
      },
    ];
    for (const { s, accept, error } of table) {
      if (accept) {
        expect(core.scenarioLegalMoves(s, s.startFEN).length, s.id).toBeGreaterThan(0);
      } else {
        expect(() => core.scenarioLegalMoves(s, s.startFEN), s.id).toThrow(error);
      }
    }
  });

  it('core outputs carry exactly the keys the TS types declare', async () => {
    const core = await loadCore();
    const keysOf = (o: object): string[] => Object.keys(o).sort();

    // MoveInfo — every field always present on the wire.
    const move = core.legalMoves(START)[0]!;
    expect(keysOf(move)).toEqual([
      'capture',
      'castle',
      'from',
      'piece',
      'san',
      'to',
      'uci',
    ]);

    // GameResult — optional fields appear exactly when meaningful.
    const foolsMate =
      'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3';
    expect(keysOf(core.result(foolsMate))).toEqual([
      'check',
      'reason',
      'status',
      'winner',
    ]);
    expect(keysOf(core.result(START))).toEqual(['check', 'status']);

    // ScenarioResult — movesLeft rides with a budget, reason with failure.
    const race: Scenario = {
      id: 'w-race',
      startFEN: '8/8/8/8/8/8/8/R7 w - - 0 1',
      allowed: { pieces: ['R'] },
      goal: { type: 'reach-square', square: 'h8', piece: 'R' },
      movesBudget: 2,
    };
    const won = core.scenarioApply(race, core.scenarioApply(race, race.startFEN, 'a1a8'), 'a8h8');
    expect(keysOf(core.scenarioResult(race, won))).toEqual([
      'movesLeft',
      'movesUsed',
      'status',
    ]);

    // OpponentReply — from a scenario opponent and from the full-game
    // helper alike; the applied move is a full MoveInfo.
    const survive: Scenario = {
      id: 'w-reply',
      startFEN: 'r7/8/8/8/8/2N5/8/8 w - - 0 1',
      allowed: { pieces: ['N'] },
      goal: { type: 'survive', moves: 2 },
      opponent: 'greedy',
      movesBudget: 2,
    };
    const afterLearner = core.scenarioApply(survive, survive.startFEN, 'c3e2');
    const reply = core.scenarioOpponentMove(survive, afterLearner);
    expect(keysOf(reply)).toEqual(['fen', 'move']);
    expect(keysOf(reply.move!)).toEqual([
      'capture',
      'castle',
      'from',
      'piece',
      'san',
      'to',
      'uci',
    ]);
    const gameReply = core.greedyMove(START);
    expect(keysOf(gameReply)).toEqual(['fen', 'move']);

    // Eval — the deferred oracle seam's stable shape.
    expect(keysOf(core.evaluate(START))).toEqual(['status']);
  });
});
