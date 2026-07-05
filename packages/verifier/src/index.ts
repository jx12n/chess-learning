/**
 * @chess/verifier — the generate-then-verify gate.
 *
 * `verifyExercise` proves, by exhaustive breadth-first search over the
 * truth core's restricted move sets, that an exercise is (a) well-formed,
 * (b) solvable within its budget, and (c) on-target for the skill node
 * that wants to serve it. Nothing pedagogical is trusted: every chess
 * claim is a core call. No engine oracle is needed for the basics —
 * solvability of a mini-game is pure search; Stockfish enters later
 * (via the core's `evaluate` seam) only for tactical claims.
 *
 * `unique` semantics (decided here, inherited by tactics later):
 * an exercise is `unique` when exactly one minimal-length solution
 * exists. Day 1 mini-games are required to be *completable* (solvable),
 * not uniquely optimal — `unique` is reported as a signal for authors
 * and future generators, and is NOT part of the serve gate.
 */

import { loadCore, type Scenario } from '@chess/core';
import type { Exercise, TeachingTarget } from '@chess/curriculum';

export interface VerifyReport {
  /** Schema/FEN/goal are well-formed and the core accepts the position. */
  valid: boolean;
  /** A solution exists within the budget (and search depth cap). */
  solvable: boolean;
  /** Length of the shortest solution, when one exists. */
  minSolutionLength: number | null;
  /** Representative minimal solutions (UCI paths), up to a small cap. */
  solutions: string[][];
  /** Exactly one minimal-length solution exists. Informational. */
  unique: boolean;
  /** Exercise matches the node's teaching target. */
  onTarget: boolean;
  reason?: string;
}

export interface VerifyOptions {
  /** Search depth cap for scenarios with no moves budget. */
  maxDepth?: number;
  /** Max representative solutions to return. */
  maxSolutions?: number;
}

const SQUARE_RE = /^[a-h][1-8]$/;

/** Opponents the game kind can gate on today — grows with the core. */
const SUPPORTED_GAME_OPPONENTS: ReadonlySet<string> = new Set(['greedy']);

/** Board-state key: FEN minus the move counters. In an opponentless
 * mini-game the remaining fields fully determine the future, so BFS may
 * dedupe on them across depths (first visit is via a shortest path).
 * For goals whose truth depends on moves-used (survive), the BFS depth
 * joins the key — taken from the walk itself, never from the FEN's
 * counters (those belong to the core's budget clock and may change out
 * from under us): the same placement at a different depth is a genuinely
 * different state there — surviving N moves from a later re-visit needs
 * fewer safe moves than from the first — and cross-depth dedup would
 * wrongly prune the deeper path. */
function stateKey(fen: string, depth: number | null): string {
  const base = fen.split(' ').slice(0, 4).join(' ');
  return depth === null ? base : `${depth}|${base}`;
}

/** Goals whose success predicate reads moves-used, not just the board. */
function goalDependsOnDepth(scenario: Scenario): boolean {
  return scenario.goal.type === 'survive';
}

/** The all-false report every refusal branch shares. */
function refusal(onTarget: boolean, reason: string): VerifyReport {
  return {
    valid: false,
    solvable: false,
    minSolutionLength: null,
    solutions: [],
    unique: false,
    onTarget,
    reason,
  };
}

interface SearchOutcome {
  solvable: boolean;
  minSolutionLength: number | null;
  solutions: string[][];
  unique: boolean;
  reason?: string;
}

async function searchScenario(
  scenario: Scenario,
  opts: VerifyOptions,
): Promise<SearchOutcome> {
  const core = await loadCore();
  const maxSolutions = opts.maxSolutions ?? 8;
  const budget = scenario.movesBudget ?? null;
  const depthCap = budget ?? opts.maxDepth ?? 16;
  // Only a DETERMINISTIC opponent folds into a single-agent BFS: its
  // reply is a function of the position (D3), so the search never
  // branches on the enemy. 'greedy' qualifies by construction; a future
  // 'engine' (Maia-style, stochastic) must NOT fold — that day needs
  // adversarial search in the core (finding F4) — and this guard is
  // where the assumption lives. ('engine' cannot actually reach here
  // today: the core rejects it on the first scenarioLegalMoves call.)
  const foldableOpponent = scenario.opponent === 'greedy';
  const depthKeyed = goalDependsOnDepth(scenario);

  // Already solved at the start position? (Degenerate but well-defined.)
  const startResult = core.scenarioResult(scenario, scenario.startFEN);
  if (startResult.status === 'goal-met') {
    return {
      solvable: true,
      minSolutionLength: 0,
      solutions: [[]],
      unique: true,
      reason: 'goal already met at start position',
    };
  }

  interface NodeInfo {
    fen: string;
    parentKey: string | null;
    moveFromParent: string | null;
    /** Number of distinct shortest paths reaching this state. */
    pathCount: number;
  }

  const startKey = stateKey(scenario.startFEN, depthKeyed ? 0 : null);
  const info = new Map<string, NodeInfo>();
  info.set(startKey, {
    fen: scenario.startFEN,
    parentKey: null,
    moveFromParent: null,
    pathCount: 1,
  });

  let frontier = [startKey];
  const visited = new Set<string>([startKey]);

  for (let depth = 1; depth <= depthCap; depth++) {
    const nextFrontier: string[] = [];
    const discoveredThisLevel = new Set<string>();
    const goalKeys: string[] = [];

    for (const key of frontier) {
      const node = info.get(key)!;
      const moves = core.scenarioLegalMoves(scenario, node.fen);
      for (const m of moves) {
        let childFen = core.scenarioApply(scenario, node.fen, m.uci);
        let status = core.scenarioResult(scenario, childFen).status;
        // Fold the deterministic reply into this edge. Survive judges
        // only after the answer, so the result is re-read; a reply of
        // null (no legal move) still lands a valid FEN to continue from.
        if (status === 'ongoing' && foldableOpponent) {
          childFen = core.scenarioOpponentMove(scenario, childFen).fen;
          status = core.scenarioResult(scenario, childFen).status;
        }
        if (status === 'failed') {
          continue; // dead branch: budget-safe (depth caps the walk),
          //           piece lost (survive), or the position is over
        }
        const childKey = stateKey(childFen, depthKeyed ? depth : null);
        if (visited.has(childKey) && !discoveredThisLevel.has(childKey)) {
          continue; // reached earlier via a shorter path
        }
        if (discoveredThisLevel.has(childKey)) {
          info.get(childKey)!.pathCount += node.pathCount;
          continue;
        }
        discoveredThisLevel.add(childKey);
        visited.add(childKey);
        info.set(childKey, {
          fen: childFen,
          parentKey: key,
          moveFromParent: m.uci,
          pathCount: node.pathCount,
        });
        nextFrontier.push(childKey);
        if (status === 'goal-met') {
          goalKeys.push(childKey);
        }
      }
    }

    if (goalKeys.length > 0) {
      const totalPaths = goalKeys.reduce(
        (sum, k) => sum + info.get(k)!.pathCount,
        0,
      );
      const solutions = goalKeys.slice(0, maxSolutions).map((k) => {
        const path: string[] = [];
        for (let cur = info.get(k)!; cur.moveFromParent !== null; ) {
          path.unshift(cur.moveFromParent);
          cur = info.get(cur.parentKey!)!;
        }
        return path;
      });
      return {
        solvable: true,
        minSolutionLength: depth,
        solutions,
        unique: totalPaths === 1,
      };
    }
    if (nextFrontier.length === 0) {
      // With a budget, exhaustion at any depth means no solution fits
      // it (budget-dead branches are pruned above, so the frontier can
      // dry up before the loop's own cap is reached).
      return {
        solvable: false,
        minSolutionLength: null,
        solutions: [],
        unique: false,
        reason:
          budget !== null
            ? `no solution within the moves budget of ${budget}`
            : 'search space exhausted without reaching the goal',
      };
    }
    frontier = nextFrontier;
  }

  return {
    solvable: false,
    minSolutionLength: null,
    solutions: [],
    unique: false,
    reason:
      budget !== null
        ? `no solution within the moves budget of ${budget}`
        : `no solution within the search depth cap of ${depthCap}`,
  };
}

function checkOnTarget(ex: Exercise, target?: TeachingTarget): string | null {
  if (!target) return null;
  if (!target.kinds.includes(ex.kind)) {
    return `exercise kind '${ex.kind}' is not taught by this node`;
  }
  if (ex.kind === 'scenario') {
    const allowedPieces = ex.scenario.allowed?.pieces;
    if (target.pieces) {
      if (!allowedPieces) {
        return 'scenario does not restrict pieces but the node teaches specific pieces';
      }
      const extra = allowedPieces.filter((p) => !target.pieces!.includes(p));
      if (extra.length > 0) {
        return `scenario allows pieces [${extra.join(', ')}] the node does not teach`;
      }
    }
    if (target.goalTypes && !target.goalTypes.includes(ex.scenario.goal.type)) {
      return `goal type '${ex.scenario.goal.type}' is not taught by this node`;
    }
  }
  return null;
}

/** Verify one exercise against (optionally) the node that serves it. */
export async function verifyExercise(
  ex: Exercise,
  target?: TeachingTarget,
  opts: VerifyOptions = {},
): Promise<VerifyReport> {
  const offTarget = checkOnTarget(ex, target);
  const base = {
    onTarget: offTarget === null,
    ...(offTarget !== null ? { reason: offTarget } : {}),
  };

  if (ex.kind === 'find-square') {
    if (!SQUARE_RE.test(ex.square)) {
      return refusal(base.onTarget, `'${ex.square}' is not a square`);
    }
    if (ex.fen === undefined) {
      // Bare board-orientation click: the square itself is the answer.
      return {
        valid: true,
        solvable: true,
        minSolutionLength: 1,
        solutions: [[ex.square]],
        unique: true,
        ...base,
      };
    }
    // Danger-spotting (D6): the FEN is authored ENEMY-to-move, and the
    // answer square must hold a piece that enemy can capture — proven
    // against core-generated captures, never trusted from data. The
    // probe scenario below exists only to ask the core for the mover's
    // movement-model moves; its goal is inert boilerplate that the move
    // query never evaluates.
    try {
      const core = await loadCore();
      const probe: Scenario = {
        id: `${ex.id}-danger-probe`,
        startFEN: ex.fen,
        goal: { type: 'capture-all', targets: 'kqrbnp' },
      };
      const captureSquares = new Set(
        core
          .scenarioLegalMoves(probe, ex.fen)
          .filter((m) => m.capture)
          .map((m) => m.to),
      );
      const solvable = captureSquares.has(ex.square);
      return {
        valid: true,
        solvable,
        minSolutionLength: solvable ? 1 : null,
        solutions: solvable ? [[ex.square]] : [],
        // Unique when the threatened square is the only one — the
        // authoring signal for "click THE piece in danger".
        unique: solvable && captureSquares.size === 1,
        ...base,
        ...(solvable
          ? {}
          : {
              reason: `no enemy capture lands on ${ex.square} — the piece there is not in danger`,
            }),
      };
    } catch (err) {
      return refusal(base.onTarget, err instanceof Error ? err.message : String(err));
    }
  }

  if (ex.kind === 'game') {
    // A full game has no solution concept (D6): the gate proves the
    // start is a legal, still-live standard position and the opponent
    // is one the core can play — nothing more. minSolutionLength 1
    // records the one move-shaped fact a game offers (a first move
    // exists, guaranteed by status "ongoing") and keeps the serve
    // gate's "something to do" contract honest.
    try {
      const core = await loadCore();
      // Data is untrusted JSON despite the literal type — check anyway.
      if (!SUPPORTED_GAME_OPPONENTS.has(ex.opponent)) {
        return refusal(base.onTarget, `unsupported game opponent '${String(ex.opponent)}'`);
      }
      const result = core.result(ex.startFEN);
      if (result.status !== 'ongoing') {
        return refusal(
          base.onTarget,
          `game start position is not a live game (${result.status})`,
        );
      }
      return {
        valid: true,
        solvable: true,
        minSolutionLength: 1,
        solutions: [],
        unique: false,
        ...base,
      };
    } catch (err) {
      return refusal(base.onTarget, err instanceof Error ? err.message : String(err));
    }
  }

  // Scenario: every chess claim below is a core call.
  try {
    const core = await loadCore();
    core.scenarioLegalMoves(ex.scenario, ex.scenario.startFEN); // validates scenario + FEN
    const outcome = await searchScenario(ex.scenario, opts);
    return {
      valid: true,
      solvable: outcome.solvable,
      minSolutionLength: outcome.minSolutionLength,
      solutions: outcome.solutions,
      unique: outcome.unique,
      ...base,
      ...(outcome.reason && base.reason === undefined
        ? { reason: outcome.reason }
        : {}),
    };
  } catch (err) {
    return refusal(base.onTarget, err instanceof Error ? err.message : String(err));
  }
}

/** The serve gate: does this report clear an exercise for a learner?
 * `minSolutionLength >= 1` refuses degenerate content whose goal is
 * already met at the start position — solvable, but nothing to do (F6). */
export function servable(report: VerifyReport): boolean {
  return (
    report.valid &&
    report.solvable &&
    report.onTarget &&
    report.minSolutionLength !== null &&
    report.minSolutionLength >= 1
  );
}

/**
 * Serve-time reject: verify and throw unless the exercise is provably
 * servable. The play surface calls this before showing anything.
 */
export async function assertServable(
  ex: Exercise,
  target?: TeachingTarget,
  opts?: VerifyOptions,
): Promise<VerifyReport> {
  const report = await verifyExercise(ex, target, opts);
  if (!servable(report)) {
    throw new Error(
      `exercise '${ex.id}' refused: ${report.reason ?? 'not servable'} ` +
        `(valid=${report.valid} solvable=${report.solvable} onTarget=${report.onTarget})`,
    );
  }
  return report;
}
