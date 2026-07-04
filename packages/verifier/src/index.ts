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

/** Board-state key: FEN minus the move counters. In an opponentless
 * mini-game the remaining fields fully determine the future, so BFS may
 * dedupe on them across depths (first visit is via a shortest path). */
function stateKey(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
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

  const startKey = stateKey(scenario.startFEN);
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
        const childFen = core.scenarioApply(scenario, node.fen, m.uci);
        const childKey = stateKey(childFen);
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
        if (core.scenarioResult(scenario, childFen).status === 'goal-met') {
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
      return {
        solvable: false,
        minSolutionLength: null,
        solutions: [],
        unique: false,
        reason: 'search space exhausted without reaching the goal',
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
    const valid = SQUARE_RE.test(ex.square);
    return {
      valid,
      solvable: valid,
      minSolutionLength: valid ? 1 : null,
      solutions: valid ? [[ex.square]] : [],
      unique: true,
      ...base,
      ...(valid ? {} : { reason: `'${ex.square}' is not a square` }),
    };
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
    return {
      valid: false,
      solvable: false,
      minSolutionLength: null,
      solutions: [],
      unique: false,
      onTarget: base.onTarget,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

/** The serve gate: does this report clear an exercise for a learner? */
export function servable(report: VerifyReport): boolean {
  return report.valid && report.solvable && report.onTarget;
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
