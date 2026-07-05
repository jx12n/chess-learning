/**
 * @chess/core — typed access to the truth core.
 *
 * One Rust core, compiled once to WASM, loaded here for BOTH runtimes:
 * the browser (play surface) and Node (curriculum tooling, verifier,
 * tests) execute the very same `truth_core_bg.wasm` bytes, so there is
 * no legality drift between client and server.
 *
 * Every function is a thin, typed veneer over the core's JSON envelope;
 * no chess fact is ever asserted on this side of the boundary.
 */

import initWasm, {
  initSync,
  apply_move,
  core_version,
  evaluate,
  game_result,
  greedy_move,
  legal_moves,
  perft_count,
  scenario_apply,
  scenario_legal_moves,
  scenario_opponent_move,
  scenario_result,
} from '../wasm/truth_core.js';

import type {
  Constraints,
  Eval,
  GameResult,
  Goal,
  MoveInfo,
  OpponentReply,
  Scenario,
  ScenarioFailureReason,
  ScenarioResult,
} from './types.js';

export type {
  Constraints,
  Eval,
  GameResult,
  Goal,
  MoveInfo,
  OpponentReply,
  Scenario,
  ScenarioFailureReason,
  ScenarioResult,
};

/** Raised when the core reports an error (bad FEN, illegal move, ...). */
export class CoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CoreError';
  }
}

type Envelope<T> = { ok: true; data: T } | { ok: false; error: string };

function unwrap<T>(json: string): T {
  const env = JSON.parse(json) as Envelope<T>;
  if (!env.ok) throw new CoreError(env.error);
  return env.data;
}

export interface TruthCore {
  /** Legal moves under full chess rules, optionally narrowed by constraints. */
  legalMoves(fen: string, constraints?: Constraints): MoveInfo[];
  /** Apply a UCI move under full chess rules; returns the new FEN. */
  apply(fen: string, uci: string): string;
  /** Standard result: ongoing / win / draw (+reason, check flag). */
  result(fen: string): GameResult;
  /** DEFERRED oracle seam — always `{status: "unavailable"}` today. */
  evaluate(fen: string): Eval;
  /** Perft node count (correctness gate / debugging). */
  perft(fen: string, depth: number): number;
  /** Legal moves under a scenario's constraints and rules model. */
  scenarioLegalMoves(scenario: Scenario, fen: string): MoveInfo[];
  /** Apply a move under a scenario's rules; returns the new FEN. */
  scenarioApply(scenario: Scenario, fen: string, uci: string): string;
  /** Scenario status: ongoing / goal-met / failed (+moves used/left). */
  scenarioResult(scenario: Scenario, fen: string): ScenarioResult;
  /**
   * The scenario opponent's deterministic reply, applied (D3 greedy).
   * Errors when the scenario has no opponent or it is the learner's turn.
   */
  scenarioOpponentMove(scenario: Scenario, fen: string): OpponentReply;
  /**
   * The greedy opponent's reply in a FULL standard game (day 13's Pip) —
   * same policy as `opponent: "greedy"`. `move` is null when the game
   * is already over.
   */
  greedyMove(fen: string): OpponentReply;
  /** Core crate version, for cross-boundary sanity checks. */
  version(): string;
}

const api: TruthCore = {
  legalMoves: (fen, constraints) =>
    unwrap<MoveInfo[]>(legal_moves(fen, constraints ? JSON.stringify(constraints) : '')),
  apply: (fen, uci) => unwrap<string>(apply_move(fen, uci)),
  result: (fen) => unwrap<GameResult>(game_result(fen)),
  evaluate: (fen) => unwrap<Eval>(evaluate(fen)),
  perft: (fen, depth) => unwrap<number>(perft_count(fen, depth)),
  scenarioLegalMoves: (scenario, fen) =>
    unwrap<MoveInfo[]>(scenario_legal_moves(JSON.stringify(scenario), fen)),
  scenarioApply: (scenario, fen, uci) =>
    unwrap<string>(scenario_apply(JSON.stringify(scenario), fen, uci)),
  scenarioResult: (scenario, fen) =>
    unwrap<ScenarioResult>(scenario_result(JSON.stringify(scenario), fen)),
  scenarioOpponentMove: (scenario, fen) =>
    unwrap<OpponentReply>(scenario_opponent_move(JSON.stringify(scenario), fen)),
  greedyMove: (fen) => unwrap<OpponentReply>(greedy_move(fen)),
  version: () => core_version(),
};

let loading: Promise<TruthCore> | null = null;

/**
 * Load the WASM core (idempotent). In Node the artifact is read from
 * disk and instantiated synchronously; in the browser it is fetched
 * relative to the module URL (Vite treats it as an asset).
 */
export function loadCore(): Promise<TruthCore> {
  loading ??= (async () => {
    const isNode =
      typeof process !== 'undefined' && process.versions?.node !== undefined;
    if (isNode) {
      const { readFile } = await import('node:fs/promises');
      const bytes = await readFile(
        new URL('../wasm/truth_core_bg.wasm', import.meta.url),
      );
      initSync({ module: bytes });
    } else {
      await initWasm();
    }
    return api;
  })();
  return loading;
}
