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
