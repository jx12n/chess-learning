/**
 * Shared wire types for the truth-core tool API.
 *
 * These mirror the Rust types in `crates/truth-core` exactly; the JSON
 * crossing the JS↔WASM line is the contract. If you change one side,
 * change the other (the core round-trip tests catch drift).
 */

/** A move as reported by the core. `uci` is the canonical identifier. */
export interface MoveInfo {
  uci: string;
  /** Human notation ("Re4", "Rxb3"). Presentation only. */
  san: string;
  from?: string | null;
  to: string;
  /** Moving piece as a FEN letter (case = color), e.g. "R" or "p". */
  piece: string;
  capture: boolean;
  castle: boolean;
}

/** Restriction of the legal-move set. Absent fields = unrestricted. */
export interface Constraints {
  /** Roles allowed to move, uppercase FEN letters (side-agnostic), e.g. ["R"]. */
  pieces?: string[];
  /** Declarative label of the movement rules taught ("rook-lines", "all"). */
  moves?: string;
  castling?: boolean;
}

/** Custom win condition of a mini-game. */
export type Goal =
  | {
      type: 'capture-all';
      /** FEN letters, case = color: "p" = every black pawn. */
      targets: string;
    }
  | {
      type: 'reach-square';
      square: string;
      /** FEN letter, case = color: "R" = the white rook. */
      piece: string;
    }
  | {
      /** The learner's move leaves the enemy in check. Standard rules only. */
      type: 'give-check';
    }
  | {
      /** The learner's move checkmates the enemy. Standard rules only. */
      type: 'checkmate';
    }
  | {
      /**
       * The start position has the learner in check; any legal move
       * escapes (legality is the proof). Standard rules only, and the
       * start position must actually be check (core-validated).
       */
      type: 'escape-check';
    }
  | {
      /**
       * Last `moves` learner moves without losing a single piece to the
       * opponent. Movement rules with an opponent; `movesBudget` must
       * equal `moves`. Judged only once the opponent has answered the
       * final move — the last move must be safe too.
       */
      type: 'survive';
      moves: number;
    };

/**
 * A mini-game as data. `rules: "movement"` (the default) is the
 * pre-check-knowledge subset: real piece movement/captures/blocking,
 * no check semantics, kings optional. `rules: "standard"` is full chess
 * legality via shakmaty movegen — the check/mate lessons' model. D1:
 * standard scenarios never turn-reset; without an opponent they must be
 * single-move exercises (`movesBudget: 1`, core-enforced).
 */
export interface Scenario {
  id: string;
  startFEN: string;
  allowed?: Constraints;
  goal: Goal;
  /**
   * "none" (default): only the learner moves. "greedy" (D3): the
   * deterministic capture-hungry opponent — highest-value capture,
   * lexicographic UCI tiebreak, lexicographically first move otherwise;
   * constraints bind the learner only. "engine" is the deferred seam
   * for a Maia-style human-like opponent.
   */
  opponent?: 'none' | 'greedy' | 'engine';
  rules?: 'movement' | 'standard';
  /** Max learner moves; null/absent = unlimited. */
  movesBudget?: number | null;
}

/**
 * The scenario opponent's reply, already applied by the core. `move` is
 * null when the opponent has no legal reply — movement model: the turn
 * passes back to the learner (the FEN reflects that); standard rules:
 * the game is over and the position stands.
 */
export interface OpponentReply {
  move: MoveInfo | null;
  fen: string;
}

/** Standard-chess verdict for a position. */
export interface GameResult {
  status: 'ongoing' | 'win' | 'draw';
  winner?: 'white' | 'black';
  reason?: string;
  /** Side to move is in check. */
  check: boolean;
}

/**
 * Failure reasons the core reports — a wire contract the play surface
 * branches on for its closing copy. Mirrored from the REASON_* consts in
 * `crates/truth-core/src/scenario.rs`; extend both sides together.
 */
export type ScenarioFailureReason =
  | 'moves-budget-exhausted'
  | 'no-legal-moves'
  | 'piece-captured';

/** Scenario verdict for a position. */
export interface ScenarioResult {
  status: 'ongoing' | 'goal-met' | 'failed';
  reason?: ScenarioFailureReason;
  movesUsed: number;
  movesLeft?: number;
}

/** Engine-oracle seam (Stockfish/UCI), deferred: always "unavailable". */
export interface Eval {
  status: 'unavailable';
}
