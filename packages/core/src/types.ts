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
    };

/**
 * A mini-game as data. `rules: "movement"` (the default) is the
 * pre-check-knowledge subset: real piece movement/captures/blocking,
 * no check semantics, kings optional. `rules: "standard"` is a declared
 * seam for later lessons (check, mate) — the core rejects it today.
 */
export interface Scenario {
  id: string;
  startFEN: string;
  allowed?: Constraints;
  goal: Goal;
  /** "none" (default): only the learner moves. "engine" is a deferred seam. */
  opponent?: 'none' | 'engine';
  rules?: 'movement' | 'standard';
  /** Max learner moves; null/absent = unlimited. */
  movesBudget?: number | null;
}

/** Standard-chess verdict for a position. */
export interface GameResult {
  status: 'ongoing' | 'win' | 'draw';
  winner?: 'white' | 'black';
  reason?: string;
  /** Side to move is in check. */
  check: boolean;
}

/** Scenario verdict for a position. */
export interface ScenarioResult {
  status: 'ongoing' | 'goal-met' | 'failed';
  reason?: string;
  movesUsed: number;
  movesLeft?: number;
}

/** Engine-oracle seam (Stockfish/UCI), deferred: always "unavailable". */
export interface Eval {
  status: 'unavailable';
}
