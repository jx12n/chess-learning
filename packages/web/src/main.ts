/**
 * The Basics lesson driver.
 *
 * Outer loop: ask the curriculum router what to serve next.
 * Serve gate: nothing reaches the board until `assertServable` has
 *   proven it against the truth core (generate-then-verify, in the
 *   client too).
 * Inner loop: correct → advance; illegal → nudge; goal → celebrate.
 * Day pacing: node grouping, wrap-ups and teasers all come from the
 *   curriculum's `days` data — a finished day is a natural stopping
 *   point ("stop while it's still fun"), never a wall.
 * The door: the landing page (index.html) picks the player profile;
 *   arriving here without one bounces straight back. Each profile has
 *   its own learner-state entry — see profiles.ts.
 *
 * Every legality decision on this page — highlighting, move application,
 * goal detection — is a call into the WASM truth core. The UI never
 * decides a chess fact. Lesson copy (prompts, hints, wrap-ups) lives in
 * curriculum data; what remains here is mechanical narration of core
 * facts (SAN, counts, results) and last-resort fallbacks for nodes
 * missing their authored hints.
 */

import './style.css';
import {
  loadCore,
  type MoveInfo,
  type Scenario,
  type ScenarioFailureReason,
  type TruthCore,
} from '@chess/core';
import {
  counterLearnerModel as model,
  dayForNode,
  dayNodes,
  nextStep,
  theBasics,
  type Curriculum,
  type DayPlan,
  type Exercise,
  type LearnerState,
  type NextStep,
  type SkillNode,
} from '@chess/curriculum';
import { assertServable, type VerifyReport } from '@chess/verifier';
import { BoardView } from './board.js';
import { initDevPanel, type DevHooks, type DevSnapshot } from './devpanel.js';
import { currentProfile, profileStateKey, type Profile } from './profiles.js';

/** Dev mode plays on its own learner profile — the kid's is never touched. */
const DEV_STORAGE_KEY = 'chess-tutor/learner-state/dev/v1';
/** Sticky developer-options flag; set by ?dev=1, cleared by ?dev=0 or Exit. */
const DEV_FLAG_KEY = 'chess-tutor/dev/v1';
const EMPTY_BOARD_FEN = '8/8/8/8/8/8/8/8 w - - 0 1';

// Generic inner-loop copy; nodes override via their `hints` data.
const FALLBACK_SELECT_HINT = 'Click one of your pieces to see where it can go.';
const FALLBACK_ILLEGAL_HINT =
  'That square isn’t in reach right now. Pick one of the marked squares.';

let core: TruthCore;
let curriculum: Curriculum;
let state: LearnerState;
let board: BoardView;
/** Who is playing (from the landing page's door); null only in dev mode. */
let activeProfile: Profile | null = null;
/** Day of the most recently rendered step — day changes trigger the
 * day-complete celebration between two steps within a session. */
let lastDayShown: number | null = null;

let devEnabled = false;
/** Panel refresh callback; null when dev mode is off (no dev DOM exists). */
let devRefresh: (() => void) | null = null;
/** What is on screen right now — the dev panel's readout + replay anchor. */
type RenderedScreen =
  | { kind: 'lesson'; step: Extract<NextStep, { done: false }> }
  | { kind: 'sandbox'; node: SkillNode; ex: Exercise }
  | { kind: 'day-complete' }
  | { kind: 'band-complete' }
  | null;
let rendered: RenderedScreen = null;

function resolveDevFlag(): boolean {
  try {
    const q = new URLSearchParams(location.search).get('dev');
    if (q === '1') localStorage.setItem(DEV_FLAG_KEY, '1');
    if (q === '0') localStorage.removeItem(DEV_FLAG_KEY);
    return localStorage.getItem(DEV_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

function storageKey(): string {
  return devEnabled ? DEV_STORAGE_KEY : profileStateKey(activeProfile!.id);
}

const els = {} as {
  dayBadge: HTMLElement;
  progress: HTMLElement;
  nodeTitle: HTMLElement;
  objective: HTMLElement;
  phase: HTMLElement;
  puzzleCount: HTMLElement;
  prompt: HTMLElement;
  feedback: HTMLElement;
  meta: HTMLElement;
  actions: HTMLElement;
  boardWrap: HTMLElement;
};

function saveState(): void {
  try {
    localStorage.setItem(storageKey(), model.serialize(state));
  } catch {
    /* storage unavailable — session-only progress */
  }
}

function restoreState(): LearnerState {
  try {
    const raw = localStorage.getItem(storageKey());
    if (raw) return model.deserialize(raw);
  } catch {
    /* fall through to a fresh learner */
  }
  return model.init();
}

function buildShell(): void {
  const app = document.getElementById('app')!;
  app.innerHTML = `
    <header class="top">
      <h1>♜ Niboo Learns Chess <span class="day" id="day-badge"></span></h1>
      <div class="top-actions">
        <a class="ghost player-chip" id="player-chip" href="./" title="Switch player"></a>
        <button type="button" class="ghost" id="reset">Start over</button>
      </div>
    </header>
    <section class="progress" id="progress"></section>
    <main class="lesson">
      <section class="panel">
        <h2 id="node-title"></h2>
        <p class="objective" id="objective"></p>
        <span class="phase" id="phase"></span>
        <span class="puzzle-count" id="puzzle-count"></span>
        <p class="prompt" id="prompt"></p>
        <div class="feedback" id="feedback" role="status"></div>
        <div class="meta" id="meta"></div>
        <div class="actions" id="actions"></div>
      </section>
      <section class="board-wrap" id="board-wrap"></section>
    </main>
  `;
  els.dayBadge = document.getElementById('day-badge')!;
  els.progress = document.getElementById('progress')!;
  els.nodeTitle = document.getElementById('node-title')!;
  els.objective = document.getElementById('objective')!;
  els.phase = document.getElementById('phase')!;
  els.puzzleCount = document.getElementById('puzzle-count')!;
  els.prompt = document.getElementById('prompt')!;
  els.feedback = document.getElementById('feedback')!;
  els.meta = document.getElementById('meta')!;
  els.actions = document.getElementById('actions')!;
  els.boardWrap = document.getElementById('board-wrap')!;
  const chip = document.getElementById('player-chip')!;
  if (activeProfile !== null) {
    chip.textContent = `${activeProfile.piece} ${activeProfile.name}`;
  } else {
    chip.hidden = true;
  }
  document.getElementById('reset')!.addEventListener('click', () => {
    state = model.init();
    lastDayShown = null;
    resetHistory();
    saveState();
    void showNext();
  });
  board = new BoardView(els.boardWrap);
}

function setFeedback(kind: 'idle' | 'info' | 'nudge' | 'success' | 'error', text: string): void {
  els.feedback.dataset.kind = kind;
  els.feedback.textContent = text;
}

/** A correct answer flows to the next thing on its own after a beat, but
 * the button stays live throughout — a kid who wants to jump ahead (or
 * linger on the win a moment longer) can always just click it. The green
 * fill drains right→left over this span (see `.primary.arming` in the CSS)
 * and the timer fires exactly when it empties. */
const AUTO_ADVANCE_MS = 1400;

interface ActionButton {
  label: string;
  onClick: () => void;
  primary?: boolean;
  /** Shown but inert — e.g. "Next" before the current puzzle is answered. */
  disabled?: boolean;
  /**
   * A self-firing primary: shows the draining countdown fill and advances
   * on its own when the fill empties. Click and timer share one guard, so
   * whichever lands first wins and the other is a no-op.
   */
  arming?: boolean;
}

/** A pending auto-advance, if one is in flight. Cleared at the top of every
 * `setActions` call so a stale timer can never fire against an abandoned
 * step — e.g. the learner hits "← Back" or "Start over" mid-countdown. */
let pendingAdvance: ReturnType<typeof setTimeout> | null = null;

function setActions(...buttons: ActionButton[]): void {
  if (pendingAdvance !== null) {
    clearTimeout(pendingAdvance);
    pendingAdvance = null;
  }
  els.actions.innerHTML = '';
  for (const b of buttons) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = b.primary ? 'primary' : 'ghost';
    btn.disabled = b.disabled ?? false;
    // The label lives in a span so the draining fill can sit behind it.
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = b.label;
    btn.appendChild(label);
    let fired = false;
    const run = (): void => {
      if (fired) return;
      fired = true;
      b.onClick();
    };
    btn.addEventListener('click', run);
    if (b.arming) {
      btn.classList.add('arming');
      btn.style.setProperty('--advance-ms', `${AUTO_ADVANCE_MS}ms`);
      pendingAdvance = setTimeout(run, AUTO_ADVANCE_MS);
    }
    els.actions.appendChild(btn);
  }
}

function renderProgress(currentNodeId: string | null, nodes: SkillNode[]): void {
  els.progress.innerHTML = '';
  for (const node of nodes) {
    const chip = document.createElement('div');
    const isMastered = model.mastered(state, node);
    const status = isMastered ? 'mastered' : node.id === currentNodeId ? 'current' : 'locked';
    chip.className = `chip ${status}`;
    chip.innerHTML = `<span class="chip-mark">${
      isMastered ? '✓' : status === 'current' ? '●' : '○'
    }</span> ${node.title}`;
    els.progress.appendChild(chip);
  }
}

/** Nodes whose chips are shown for the current step: the step's day. */
function progressNodes(day: DayPlan | null): SkillNode[] {
  return day
    ? dayNodes(curriculum, day)
    : curriculum.nodes.filter((n) => n.status === 'active');
}

/* ------------------------ attempt instrumentation ----------------------- */

/**
 * Capture for the retention model (H): when the live puzzle was shown and
 * how many inner-loop hints it took. Reset when a puzzle mounts
 * (serveStep, after the serve gate); snapshotted into the AttemptEvent at
 * record time. Sandbox play mounts and counts too, but never records —
 * its numbers are simply discarded at the next mount. History not
 * captured now cannot be recovered later (docs/retention-model.md).
 */
let liveShownAt: number | null = null;
let liveHints = 0;

/** Called at the inner-loop hint sites only — outcome messages (a missed
 * finish) are results, not hints, and are never counted. */
function countHint(): void {
  liveHints += 1;
}

/** Record the attempt in the learner model and persist. This is the only
 * write to learner state from the play surface; reviewing the past (below)
 * never records, so the model stays a faithful record of forward progress. */
function recordAttempt(step: Extract<NextStep, { done: false }>, correct: boolean): void {
  const now = Date.now();
  state = model.observe(state, {
    nodeId: step.node.id,
    exerciseId: step.exercise.id,
    correct,
    phase: step.phase,
    at: now,
    ...(liveShownAt !== null ? { latencyMs: Math.max(0, now - liveShownAt) } : {}),
    hintCount: liveHints,
  });
  saveState();
}

/* ------------------------------ review stack ---------------------------- */

/**
 * A finished puzzle, snapshotted so the learner can page back through it
 * read-only. Session-scoped: the exact board a learner left isn't derivable
 * from saved learner state (only pass/fail is stored), so this lives in
 * memory for the sitting and is cleared on any timeline break (start-over,
 * dev jump). The learner model is never consulted or mutated to rebuild it.
 */
interface Outcome {
  /** Did they complete the task this finish? Drives presentation — a win
   * screen (green, auto-advance) vs a miss (gold, "Try again"). For
   * find-square this is always true at finish (they clicked the right
   * square); the first-try scoring rides on `scored`. */
  correct: boolean;
  /** What mastery records, when it differs from `correct` (find-square: the
   * first attempt). Omitted ⇒ record `correct`. */
  scored?: boolean;
  /** The final board to repaint in review. */
  fen: string;
  lastMove: [string, string] | null;
  /** The closing line, shown again verbatim. A miss is a gentle `nudge`,
   * never a red `error` — being wrong is never punished (see CLAUDE.md). */
  feedback: { kind: 'success' | 'nudge'; text: string };
  /** The square to re-highlight on review (target found / final capture). */
  flash: { square: string; kind: 'good' | 'hint' } | null;
}

interface HistoryEntry {
  step: Extract<NextStep, { done: false }>;
  /** Panel labels as they read when the puzzle was live. */
  dayLabel: string;
  puzzleLabel: string;
  outcome: Outcome;
}

const history: HistoryEntry[] = [];

function resetHistory(): void {
  history.length = 0;
}

/** The Back button for a given position, or null at the very first puzzle
 * (nothing behind it). Shared by every screen so Back never moves. */
function backButton(currentIndex: number): ActionButton | null {
  const target = currentIndex - 1;
  if (target < 0) return null;
  return { label: '← Back', onClick: () => renderHistoryEntry(target, 'review') };
}

/**
 * Paint a finished puzzle from its snapshot. `mode` is `finished` for the
 * fresh closing screen (a win arms the countdown; a miss offers Try again)
 * and `review` when the learner has paged back into the past (tagged
 * "review"). Either way the board is read-only.
 */
function renderHistoryEntry(index: number, mode: 'finished' | 'review'): void {
  const entry = history[index]!;
  const { step, outcome } = entry;
  const day = dayForNode(curriculum, step.node.id);
  rendered = { kind: 'lesson', step };
  els.dayBadge.textContent = entry.dayLabel;
  renderProgress(step.node.id, progressNodes(day));
  els.nodeTitle.textContent = step.node.title;
  els.objective.textContent = step.node.objective;
  els.phase.textContent = step.phase === 'assessment' ? 'Checkpoint' : 'Practice';
  els.phase.dataset.phase = step.phase;
  els.puzzleCount.textContent =
    mode === 'review' ? `${entry.puzzleLabel} · review` : entry.puzzleLabel;
  els.prompt.textContent = step.exercise.prompt;
  els.meta.textContent = '';
  // Read-only: the recorded final position, no click handler.
  board.onSquareClick = null;
  board.render(outcome.fen, {
    lastMove: outcome.lastMove,
    goal: step.exercise.kind === 'scenario' ? goalSquare(step.exercise.scenario) : null,
    flash: outcome.flash,
  });
  setFeedback(outcome.feedback.kind, outcome.feedback.text);

  // Next past the newest entry leaves the stack and serves the next live
  // puzzle; otherwise it walks one step forward through history.
  const isNewest = index === history.length - 1;
  const forward = isNewest
    ? (): void => void showNext()
    : (): void => renderHistoryEntry(index + 1, 'review');
  const buttons: ActionButton[] = [];
  const back = backButton(index);
  if (back) buttons.push(back);
  if (mode === 'finished' && !outcome.correct) {
    // A miss is never a dead end: replaying the exact puzzle is the
    // encouraged path (primary), and Next is always there to move on.
    buttons.push({ label: '↺ Again', primary: true, onClick: () => void serveStep(step) });
    buttons.push({ label: 'Next →', onClick: forward });
  } else {
    buttons.push({
      label: 'Next →',
      primary: true,
      onClick: forward,
      arming: mode === 'finished' && outcome.correct,
    });
  }
  setActions(...buttons);
  devRefresh?.();
}

/**
 * The pager for a live, not-yet-answered puzzle: Back reviews the previous
 * puzzle (if any), an optional "Try again" restarts the current attempt
 * (scenarios), and Next is present but disabled until an answer lands.
 */
function renderLivePager(retry?: () => void): void {
  const buttons: ActionButton[] = [];
  const back = backButton(history.length);
  if (back) buttons.push(back);
  if (retry) buttons.push({ label: '↺ Again', onClick: retry });
  buttons.push({ label: 'Next →', primary: true, onClick: () => {}, disabled: true });
  setActions(...buttons);
}

/* ------------------------- find-square exercises ------------------------ */

/** A player finishes by handing its full outcome to `onFinished`, which
 * owns the completion actions — record-and-continue in a lesson, replay in
 * a dev sandbox. The snapshot (board, message, flash) is what lets the
 * lesson stack a reviewable entry; players never touch learner state. */
type OnFinished = (outcome: Outcome) => void;

/** A running player. `retry`, when present, restarts the current attempt in
 * place (scenarios) — the caller wires it into the live pager's "Try again". */
interface PlayHandle {
  retry?: () => void;
}

/**
 * The `game` kind is schema-complete and serve-gated (D6), but its play
 * surface — the full-game table vs. a named opponent — ships with day 13's
 * build-day-experience pass. No authored data serves the kind yet, so only
 * a build mistake can reach this; it refuses like a failed verification
 * (infrastructure honesty), never as the learner's miss.
 */
function refuseUnbuiltKind(kind: Exercise['kind']): PlayHandle {
  setFeedback(
    'error',
    `This lesson needs a part of the app that isn't built yet (${kind}) — nothing to fix on your side.`,
  );
  board.onSquareClick = null;
  board.render(EMPTY_BOARD_FEN);
  return {};
}

function playFindSquare(
  node: SkillNode,
  ex: Extract<Exercise, { kind: 'find-square' }>,
  onFinished: OnFinished,
): PlayHandle {
  // Bare find-square is the empty board-orientation click; with a FEN it
  // is a danger-spotting question (D6) — same interaction, position shown.
  const boardFEN = ex.fen ?? EMPTY_BOARD_FEN;
  board.render(boardFEN);
  setFeedback('info', 'Click a square on the board.');
  // The action bar (the Back/Next pager) is owned by the caller, not the
  // player — see serveStep / playSandbox.
  // Mastery is scored on the first click; retries afterward just let the
  // learner correct themselves before moving on.
  let firstAttemptCorrect: boolean | null = null;

  board.onSquareClick = (square) => {
    const correct = square === ex.square;
    firstAttemptCorrect ??= correct;
    // A miss glows the target gold (never a red buzz) and leaves the board
    // live so the next tap can land it — retry is built in.
    board.render(boardFEN, {
      flash: { square: correct ? square : ex.square, kind: correct ? 'good' : 'hint' },
    });
    if (correct) {
      board.onSquareClick = null;
      const text =
        ex.fen === undefined ? `Yes — that's ${ex.square}. ✓` : `Yes — you spotted it! ✓`;
      setFeedback('success', text);
      // Landing the square is always a win (they got there); mastery credit
      // rides on whether the FIRST tap was right.
      onFinished({
        correct: true,
        scored: firstAttemptCorrect!,
        fen: boardFEN,
        lastMove: null,
        feedback: { kind: 'success', text },
        // Re-flash the found square in review.
        flash: { square: ex.square, kind: 'good' },
      });
    } else {
      countHint();
      // Bare orientation clicks teach the coordinate system in the nudge;
      // danger-spotting nudges are lesson copy and come from the node's
      // data (hints.illegal), never hardcoded here.
      setFeedback(
        'nudge',
        ex.fen === undefined
          ? `Good try! ${ex.square} is file ${ex.square[0]} ` +
              `(count a–h from the left) and rank ${ex.square[1]} (count 1–8 from the bottom) — ` +
              `it's glowing now, give it a tap.`
          : (node.hints?.illegal ??
            'Good try! The right square is glowing now — give it a tap.'),
      );
    }
  };
  return {};
}

/* --------------------------- scenario exercises ------------------------- */

function goalSquare(scenario: Scenario): string | null {
  return scenario.goal.type === 'reach-square' ? scenario.goal.square : null;
}

/**
 * Closing line for a met goal. Exhaustive over `Goal` on purpose: a new
 * goal type FAILS TYPECHECK here instead of silently falling through to
 * bland copy — the tripwire for the next band's authors.
 */
function goalMetCopy(scenario: Scenario, san: string, promoted: boolean, count: string): string {
  if (promoted) return `⭐ ${san} — a brand-new QUEEN! 👑 Done in ${count}!`;
  const goal = scenario.goal;
  switch (goal.type) {
    case 'capture-all':
      return `⭐ Gobbled them all in ${count}!`;
    case 'reach-square':
      return `⭐ Made it in ${count}!`;
    case 'give-check':
      return `⭐ ${san} — CHECK! The enemy king is under attack!`;
    case 'checkmate':
      return `⭐ ${san} — CHECKMATE! The king can't escape. 👑`;
    case 'escape-check':
      return `⭐ ${san} — safe! You found the way out of check!`;
    case 'survive':
      return `⭐ You made it — ${count} and nothing got gobbled!`;
    default: {
      // Unreachable while the switch covers Goal: an unknown goal type
      // would have been refused by the core long before play.
      const unhandled: never = goal;
      throw new Error(`unhandled goal type ${JSON.stringify(unhandled)}`);
    }
  }
}

/** Closing line for a failed attempt — always a gentle nudge, never blame. */
function failedCopy(reason: ScenarioFailureReason | undefined, replyTold: string): string {
  switch (reason) {
    case 'moves-budget-exhausted':
      return 'Out of moves — no worries! Give it another go, and look at the whole board first.';
    case 'piece-captured':
      return `Snapped up!${replyTold} Try again and pick a safer square.`;
    default:
      return 'That’s the end of this one — give it another go whenever you like.';
  }
}

function playScenario(
  node: SkillNode,
  ex: Extract<Exercise, { kind: 'scenario' }>,
  onFinished: OnFinished,
): PlayHandle {
  const scenario = ex.scenario;
  const selectHint = node.hints?.select ?? FALLBACK_SELECT_HINT;
  const illegalHint = node.hints?.illegal ?? FALLBACK_ILLEGAL_HINT;
  let fen = scenario.startFEN;
  let selected: string | null = null;
  let lastMove: [string, string] | null = null;
  let finished = false;

  const legalNow = (): MoveInfo[] => core.scenarioLegalMoves(scenario, fen);

  const draw = (flash?: { square: string; kind: 'good' | 'hint' }): void => {
    const legal = legalNow();
    const fromSelected = legal.filter((m) => m.from === selected);
    board.render(fen, {
      selected,
      targets: new Set(fromSelected.map((m) => m.to)),
      captureTargets: new Set(fromSelected.filter((m) => m.capture).map((m) => m.to)),
      goal: goalSquare(scenario),
      lastMove,
      flash: flash ?? null,
    });
    const r = core.scenarioResult(scenario, fen);
    els.meta.textContent =
      r.movesLeft !== undefined
        ? `Moves left: ${r.movesLeft}`
        : r.movesUsed > 0
          ? `Moves used: ${r.movesUsed}`
          : '';
  };

  // Restart the current attempt in place — the live pager's "Try again".
  const restart = (): void => {
    fen = scenario.startFEN;
    selected = null;
    lastMove = null;
    setFeedback('info', 'Fresh start — take your time.');
    draw();
  };

  const finish = (correct: boolean, message: string, endSquare: string): void => {
    finished = true;
    board.onSquareClick = null;
    // A miss is a gentle nudge, never a red error — see CLAUDE.md.
    const kind = correct ? 'success' : 'nudge';
    setFeedback(kind, message);
    onFinished({
      correct,
      fen,
      lastMove,
      feedback: { kind, text: message },
      flash: { square: endSquare, kind: correct ? 'good' : 'hint' },
    });
  };

  board.onSquareClick = (square) => {
    if (finished) return;
    const legal = legalNow();
    // Standard rules offer four promotions per push (q/r/b/n) on the same
    // from→to click; the surface auto-queens — underpromotion is a
    // later-band affordance. The movement model already auto-queens.
    const matches = selected
      ? legal.filter((m) => m.from === selected && m.to === square)
      : [];
    const chosen = matches.find((m) => m.uci.endsWith('q')) ?? matches[0];

    if (chosen) {
      fen = core.scenarioApply(scenario, fen, chosen.uci);
      lastMove = [chosen.from!, chosen.to];
      selected = null;
      // Promotion is visible in the SAN the core reports ("b8=Q") —
      // presentation only; the transform itself happened in the core.
      const promoted = chosen.san.includes('=');
      let result = core.scenarioResult(scenario, fen);
      // The deterministic opponent (D3) answers inside the same tap:
      // survive judges only after the reply, so the result is re-read.
      let reply: MoveInfo | null = null;
      if (result.status === 'ongoing' && (scenario.opponent ?? 'none') !== 'none') {
        const answer = core.scenarioOpponentMove(scenario, fen);
        fen = answer.fen;
        reply = answer.move;
        if (reply?.from != null) lastMove = [reply.from, reply.to];
        result = core.scenarioResult(scenario, fen);
      }
      const replyTold =
        reply === null ? '' : ` The other side answers ${reply.san}${reply.capture ? '!' : '.'}`;
      if (result.status === 'goal-met') {
        const count = `${result.movesUsed} ${result.movesUsed === 1 ? 'move' : 'moves'}`;
        draw({ square: chosen.to, kind: 'good' });
        finish(true, goalMetCopy(scenario, chosen.san, promoted, count), chosen.to);
      } else if (result.status === 'failed') {
        draw({ square: chosen.to, kind: 'hint' });
        finish(false, failedCopy(result.reason, replyTold), chosen.to);
      } else {
        // Keep momentum: re-select the piece so its new lines light up.
        // (With an opponent, the reply may have taken it — the selection
        // then matches nothing and the next tap simply starts fresh.)
        selected = chosen.to;
        setFeedback(
          promoted || chosen.capture ? 'success' : 'info',
          promoted
            ? `${chosen.san} — your pawn became a QUEEN! 👑${replyTold}`
            : chosen.capture
              ? `${chosen.san} — gobbled!${replyTold}`
              : `${chosen.san}.${replyTold}`,
        );
        draw();
      }
      return;
    }

    const movable = legal.some((m) => m.from === square);
    if (movable) {
      selected = square;
      const canCapture = legal.some((m) => m.from === square && m.capture);
      setFeedback(
        'info',
        canCapture
          ? 'Now click one of the highlighted squares — a red ring means you can gobble that piece!'
          : 'Now click one of the highlighted squares.',
      );
      draw();
      return;
    }

    // Inner-loop nudges: nothing happens on the board for illegal input.
    if (selected) {
      countHint();
      setFeedback('nudge', illegalHint);
      draw({ square, kind: 'hint' });
    } else {
      countHint();
      setFeedback('nudge', selectHint);
      draw({ square, kind: 'hint' });
    }
  };

  setFeedback('info', selectHint);
  // The action bar (the Back/Next pager) is owned by the caller — see
  // serveStep / playSandbox.
  draw();
  return { retry: restart };
}

/* ------------------------------ outer loop ------------------------------ */

const verifyCache = new Map<string, Promise<VerifyReport>>();

function verifyOnce(node: SkillNode, exercise: Exercise): Promise<VerifyReport> {
  let p = verifyCache.get(exercise.id);
  if (!p) {
    p = assertServable(exercise, node.teaches);
    verifyCache.set(exercise.id, p);
  }
  return p;
}

/** Between two days: celebrate, offer the stopping point, tease tomorrow. */
function renderDayComplete(finished: DayPlan, next: DayPlan): void {
  rendered = { kind: 'day-complete' };
  els.dayBadge.textContent = `Day ${finished.day}`;
  renderProgress(null, dayNodes(curriculum, finished));
  els.nodeTitle.textContent = `Day ${finished.day} complete! 🎉`;
  els.objective.textContent = '';
  els.phase.textContent = '';
  els.puzzleCount.textContent = '';
  els.prompt.textContent = `${finished.wrapUp} ${finished.teaser}`;
  setFeedback(
    'success',
    dayNodes(curriculum, finished)
      .map((n) => `${n.title} ✓`)
      .join(' · '),
  );
  els.meta.textContent = 'That’s a great place to stop for today — or keep going!';
  board.onSquareClick = null; // the board keeps the final, conquered position
  setActions({
    label: `Start Day ${next.day}: ${next.title}`,
    primary: true,
    onClick: () => {
      lastDayShown = next.day;
      void showNext();
    },
  });
}

/** The whole band mastered: celebration copy comes from the data. */
function renderComplete(): void {
  rendered = { kind: 'band-complete' };
  const days = curriculum.days ?? [];
  els.dayBadge.textContent = days.length > 0 ? `All ${days.length} days` : '';
  els.progress.innerHTML = '';
  for (const d of days) {
    const chip = document.createElement('div');
    chip.className = 'chip mastered';
    chip.innerHTML = `<span class="chip-mark">✓</span> Day ${d.day}: ${d.title}`;
    els.progress.appendChild(chip);
  }
  els.nodeTitle.textContent = `${curriculum.title} — complete! 🎉`;
  els.objective.textContent = '';
  els.phase.textContent = '';
  els.puzzleCount.textContent = '';
  els.prompt.textContent = curriculum.complete ?? 'Every lesson mastered.';
  setFeedback('success', 'Every square, every piece, every gobble. ⭐');
  els.meta.textContent = '';
  board.onSquareClick = null;
  setActions({
    label: 'Play again from the start',
    onClick: () => {
      state = model.init();
      lastDayShown = null;
      resetHistory();
      saveState();
      void showNext();
    },
  });
}

async function showNext(): Promise<void> {
  const step = nextStep(curriculum, model, state);
  if (step.done) {
    renderComplete();
    devRefresh?.();
    return;
  }
  const day = dayForNode(curriculum, step.node.id);
  // Crossing into a new day mid-session → celebrate the finished one
  // first. (On a fresh load we resume directly wherever the learner is.)
  if (day !== null && lastDayShown !== null && day.day > lastDayShown) {
    const finished = curriculum.days?.find((d) => d.day === lastDayShown);
    if (finished) {
      renderDayComplete(finished, day);
      devRefresh?.();
      return;
    }
  }
  await serveStep(step);
}

/**
 * Serve one live puzzle: paint the panel, clear the serve gate, hand the
 * board to its player, and show the live pager. Factored out of `showNext`
 * so "↺ Try again" can replay the exact same step without asking the router
 * (a retry is the same puzzle, not the next one).
 */
async function serveStep(step: Extract<NextStep, { done: false }>): Promise<void> {
  const day = dayForNode(curriculum, step.node.id);
  rendered = { kind: 'lesson', step };
  if (day !== null) lastDayShown = day.day;
  els.dayBadge.textContent = day !== null ? `Day ${day.day}` : '';
  renderProgress(step.node.id, progressNodes(day));
  els.nodeTitle.textContent = step.node.title;
  els.objective.textContent = step.node.objective;
  els.phase.textContent = step.phase === 'assessment' ? 'Checkpoint' : 'Practice';
  els.phase.dataset.phase = step.phase;
  // "How much is left?" — the shortest path through this node is
  // mastery.n correct practices plus the checkpoint (if any).
  const puzzlesTotal = step.node.mastery.n + (step.node.assessment !== undefined ? 1 : 0);
  const puzzleNow =
    step.phase === 'assessment' ? puzzlesTotal : model.practiceProgress(state, step.node) + 1;
  const puzzleLabel = `Puzzle ${puzzleNow} of ${puzzlesTotal}`;
  const dayLabel = els.dayBadge.textContent ?? '';
  els.puzzleCount.textContent = puzzleLabel;
  els.prompt.textContent = step.exercise.prompt;
  els.meta.textContent = '';
  setActions();
  devRefresh?.();

  // On finish: record the attempt once, stack a reviewable snapshot, and
  // re-render as the newest history entry — which flips the disabled "Next"
  // to enabled (and arms the countdown on a win). See renderHistoryEntry.
  const recordAndFinish: OnFinished = (outcome) => {
    recordAttempt(step, outcome.scored ?? outcome.correct);
    history.push({ step, dayLabel, puzzleLabel, outcome });
    renderHistoryEntry(history.length - 1, 'finished');
  };
  const handle = await gateAndMount(step.node, step.exercise, recordAndFinish);
  if (handle === null) return;
  // The live puzzle isn't in history yet: Back reviews the prior puzzle,
  // "Try again" (scenarios) restarts the attempt, and Next stays disabled
  // until an answer lands.
  renderLivePager(handle.retry);
}

/**
 * Serve-time gate + player dispatch, shared by the lesson and the dev
 * sandbox so refusal and mounting can never drift apart: nothing
 * unverified ever reaches the learner, from any door. Returns null when
 * the exercise is refused (the refusal is already on screen).
 */
async function gateAndMount(
  node: SkillNode,
  ex: Exercise,
  onFinished: OnFinished,
): Promise<PlayHandle | null> {
  setFeedback('info', 'Checking this exercise against the truth core…');
  try {
    await verifyOnce(node, ex);
  } catch (err) {
    setFeedback(
      'error',
      `This exercise failed verification and will not be shown. ${err instanceof Error ? err.message : err}`,
    );
    board.onSquareClick = null;
    board.render(EMPTY_BOARD_FEN);
    return null;
  }
  // Arm the attempt instrumentation (H) the moment the puzzle is in
  // front of the learner — after the gate, before the first interaction.
  // Sandbox mounts arm it too, but never record, so those numbers are
  // simply discarded at the next mount.
  liveShownAt = Date.now();
  liveHints = 0;
  return ex.kind === 'find-square'
    ? playFindSquare(node, ex, onFinished)
    : ex.kind === 'scenario'
      ? playScenario(node, ex, onFinished)
      : refuseUnbuiltKind(ex.kind);
}

/* ---------------------------- developer options -------------------------- */

/** Play one exercise outside the outer loop: nothing is recorded, but the
 * serve gate still runs — an unservable exercise is refused here too. */
async function playSandbox(node: SkillNode, ex: Exercise): Promise<void> {
  rendered = { kind: 'sandbox', node, ex };
  const day = dayForNode(curriculum, node.id);
  els.dayBadge.textContent = day !== null ? `Day ${day.day}` : '';
  renderProgress(node.id, progressNodes(day));
  els.nodeTitle.textContent = node.title;
  els.objective.textContent = node.objective;
  els.phase.textContent = 'Sandbox';
  els.phase.dataset.phase = 'sandbox';
  els.puzzleCount.textContent = 'not recorded';
  els.prompt.textContent = ex.prompt;
  els.meta.textContent = '';
  setActions();
  devRefresh?.();
  // Sandbox finishes carry the same outcome, but the panel ignores it —
  // nothing is recorded here and the review stack is a lesson-only concept.
  const replayOrLeave: OnFinished = () =>
    setActions(
      { label: 'Play again', primary: true, onClick: () => void playSandbox(node, ex) },
      { label: 'Back to the lesson', onClick: () => void showNext() },
    );
  await gateAndMount(node, ex, replayOrLeave);
}

function devSnapshot(): DevSnapshot {
  if (rendered === null) return { kind: 'none', dayLabel: '' };
  const dayLabel = els.dayBadge.textContent ?? '';
  if (rendered.kind === 'lesson') {
    const { step } = rendered;
    return {
      kind: 'lesson',
      dayLabel,
      node: step.node,
      phase: step.phase,
      exercise: step.exercise,
      attempts: model.practiceAttempts(state, step.node.id),
      progress: `${model.practiceProgress(state, step.node)}/${step.node.mastery.n}`,
    };
  }
  if (rendered.kind === 'sandbox') {
    return { kind: 'sandbox', dayLabel, node: rendered.node, exercise: rendered.ex };
  }
  return { kind: rendered.kind, dayLabel };
}

function initDev(): void {
  const hooks: DevHooks = {
    curriculum,
    model,
    snapshot: devSnapshot,
    applyState(next, lastDay) {
      state = next;
      lastDayShown = lastDay;
      // A synthesized jump breaks the timeline — the review stack no longer
      // reflects a continuous play session, so drop it.
      resetHistory();
      saveState();
      void showNext();
    },
    playSandbox,
    async replay() {
      if (rendered?.kind === 'sandbox') await playSandbox(rendered.node, rendered.ex);
      else await showNext();
    },
    verifyReport: verifyOnce,
    clickSquare(square) {
      board.onSquareClick?.(square);
    },
    serializeState: () => model.serialize(state),
    exitDev() {
      try {
        localStorage.removeItem(DEV_FLAG_KEY);
      } catch {
        /* ignore */
      }
      const url = new URL(location.href);
      url.searchParams.delete('dev');
      location.href = url.toString();
    },
  };
  devRefresh = initDevPanel(hooks);
}

async function main(): Promise<void> {
  devEnabled = resolveDevFlag();
  // The door: no player selected → back to the landing page. Dev mode
  // stands on its own isolated profile and needs no player.
  activeProfile = currentProfile();
  if (!devEnabled && activeProfile === null) {
    location.replace('./');
    return;
  }
  core = await loadCore();
  curriculum = theBasics();
  state = restoreState();
  buildShell();
  if (devEnabled) {
    initDev();
  } else if (import.meta.env.DEV) {
    // Dev-server builds keep the backstage discoverable: Ctrl+Shift+D
    // enables the sticky flag. Production entry is ?dev=1.
    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        try {
          localStorage.setItem(DEV_FLAG_KEY, '1');
        } catch {
          /* ignore */
        }
        location.reload();
      }
    });
  }
  await showNext();
}

void main();
