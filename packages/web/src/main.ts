/**
 * Day 1 lesson driver.
 *
 * Outer loop: ask the curriculum router what to serve next.
 * Serve gate: nothing reaches the board until `assertServable` has
 *   proven it against the truth core (generate-then-verify, in the
 *   client too).
 * Inner loop: correct → advance; illegal → nudge; goal → celebrate.
 *
 * Every legality decision on this page — highlighting, move application,
 * goal detection — is a call into the WASM truth core. The UI never
 * decides a chess fact.
 */

import './style.css';
import {
  loadCore,
  type MoveInfo,
  type Scenario,
  type TruthCore,
} from '@chess/core';
import {
  counterLearnerModel as model,
  nextStep,
  theBasics,
  type Curriculum,
  type Exercise,
  type LearnerState,
  type NextStep,
  type SkillNode,
} from '@chess/curriculum';
import { assertServable, type VerifyReport } from '@chess/verifier';
import { BoardView } from './board.js';

const STORAGE_KEY = 'chess-tutor/learner-state/v1';
const EMPTY_BOARD_FEN = '8/8/8/8/8/8/8/8 w - - 0 1';

let core: TruthCore;
let curriculum: Curriculum;
let state: LearnerState;
let board: BoardView;

const els = {} as {
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
    localStorage.setItem(STORAGE_KEY, model.serialize(state));
  } catch {
    /* storage unavailable — session-only progress */
  }
}

function restoreState(): LearnerState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
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
      <h1>♜ Learn Chess <span class="day">Day 1</span></h1>
      <button type="button" class="ghost" id="reset">Start over</button>
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
  document.getElementById('reset')!.addEventListener('click', () => {
    state = model.init();
    saveState();
    void showNext();
  });
  board = new BoardView(els.boardWrap);
}

function setFeedback(kind: 'idle' | 'info' | 'nudge' | 'success' | 'error', text: string): void {
  els.feedback.dataset.kind = kind;
  els.feedback.textContent = text;
}

function setActions(...buttons: Array<{ label: string; onClick: () => void; primary?: boolean }>): void {
  els.actions.innerHTML = '';
  for (const b of buttons) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = b.label;
    btn.className = b.primary ? 'primary' : 'ghost';
    btn.addEventListener('click', b.onClick);
    els.actions.appendChild(btn);
  }
}

function renderProgress(currentNodeId: string | null): void {
  els.progress.innerHTML = '';
  for (const node of curriculum.nodes.filter((n) => n.status === 'active')) {
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

/** Record the attempt, persist, and move the outer loop forward. */
function completeAttempt(step: Extract<NextStep, { done: false }>, correct: boolean): void {
  state = model.observe(state, {
    nodeId: step.node.id,
    exerciseId: step.exercise.id,
    correct,
    phase: step.phase,
  });
  saveState();
  void showNext();
}

/* ------------------------- find-square exercises ------------------------ */

function playFindSquare(
  step: Extract<NextStep, { done: false }>,
  ex: Extract<Exercise, { kind: 'find-square' }>,
): void {
  board.render(EMPTY_BOARD_FEN);
  setFeedback('info', 'Click a square on the board.');
  setActions();
  // Mastery is scored on the first click; retries afterward just let the
  // learner correct themselves before moving on.
  let firstAttemptCorrect: boolean | null = null;

  board.onSquareClick = (square) => {
    const correct = square === ex.square;
    firstAttemptCorrect ??= correct;
    board.render(EMPTY_BOARD_FEN, {
      flash: { square: correct ? square : ex.square, kind: correct ? 'good' : 'bad' },
    });
    if (correct) {
      board.onSquareClick = null;
      setFeedback('success', `Yes — that's ${ex.square}. ✓`);
      setActions({
        label: 'Continue',
        primary: true,
        onClick: () => completeAttempt(step, firstAttemptCorrect!),
      });
    } else {
      setFeedback(
        'error',
        `You clicked ${square}. The square ${ex.square} is file ${ex.square[0]} ` +
          `(counting a–h from the left) and rank ${ex.square[1]} (counting 1–8 from the bottom) — ` +
          `it just flashed. Try clicking it now.`,
      );
    }
  };
}

/* --------------------------- scenario exercises ------------------------- */

function goalSquare(scenario: Scenario): string | null {
  return scenario.goal.type === 'reach-square' ? scenario.goal.square : null;
}

function playScenario(
  step: Extract<NextStep, { done: false }>,
  ex: Extract<Exercise, { kind: 'scenario' }>,
): void {
  const scenario = ex.scenario;
  let fen = scenario.startFEN;
  let selected: string | null = null;
  let lastMove: [string, string] | null = null;
  let finished = false;

  const legalNow = (): MoveInfo[] => core.scenarioLegalMoves(scenario, fen);

  const draw = (flash?: { square: string; kind: 'good' | 'bad' }): void => {
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

  const restart = (): void => {
    fen = scenario.startFEN;
    selected = null;
    lastMove = null;
    setFeedback('info', 'Back to the start — take your time.');
    draw();
  };

  const finish = (correct: boolean, message: string): void => {
    finished = true;
    board.onSquareClick = null;
    setFeedback(correct ? 'success' : 'error', message);
    setActions({ label: 'Continue', primary: true, onClick: () => completeAttempt(step, correct) });
  };

  board.onSquareClick = (square) => {
    if (finished) return;
    const legal = legalNow();
    const chosen = selected ? legal.find((m) => m.from === selected && m.to === square) : undefined;

    if (chosen) {
      fen = core.scenarioApply(scenario, fen, chosen.uci);
      lastMove = [chosen.from!, chosen.to];
      selected = null;
      const result = core.scenarioResult(scenario, fen);
      if (result.status === 'goal-met') {
        draw({ square: chosen.to, kind: 'good' });
        finish(
          true,
          scenario.goal.type === 'capture-all'
            ? `⭐ Gobbled them all in ${result.movesUsed} moves!`
            : `⭐ Made it in ${result.movesUsed} moves!`,
        );
      } else if (result.status === 'failed') {
        draw({ square: chosen.to, kind: 'bad' });
        finish(
          false,
          result.reason === 'moves-budget-exhausted'
            ? 'Out of moves this time. Watch which squares light up — the rook only slides in straight lines.'
            : 'No moves left — this attempt is over.',
        );
      } else {
        // Keep momentum: re-select the piece so its new lines light up.
        selected = chosen.to;
        setFeedback(
          chosen.capture ? 'success' : 'info',
          chosen.capture ? `${chosen.san} — pawn gobbled!` : `${chosen.san}.`,
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
      setFeedback(
        'nudge',
        'The rook can only slide along its row or column, and it can’t jump over pieces. Pick one of the marked squares.',
      );
      draw({ square, kind: 'bad' });
    } else {
      setFeedback('nudge', 'Click your white rook ♖ first, then pick where it goes.');
      draw({ square, kind: 'bad' });
    }
  };

  setFeedback('info', 'Click your rook to see where it can go.');
  setActions({ label: 'Restart puzzle', onClick: restart });
  draw();
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

function renderComplete(): void {
  renderProgress(null);
  els.nodeTitle.textContent = 'Day 1 complete! 🎉';
  els.objective.textContent = '';
  els.phase.textContent = '';
  els.puzzleCount.textContent = '';
  els.prompt.textContent =
    'You can name any square, march a rook down its lines, and gobble everything in its path. ' +
    'Bishops are next — their diagonals are waiting.';
  setFeedback('success', 'Board orientation ✓ · Rook movement ✓ · Rook capture ✓');
  els.meta.textContent = '';
  board.onSquareClick = null;
  board.render('6p1/1p6/8/5p2/2p5/7p/8/4R3 w - - 0 1');
  setActions({
    label: 'Play again from the start',
    onClick: () => {
      state = model.init();
      saveState();
      void showNext();
    },
  });
}

async function showNext(): Promise<void> {
  const step = nextStep(curriculum, model, state);
  if (step.done) {
    renderComplete();
    return;
  }
  renderProgress(step.node.id);
  els.nodeTitle.textContent = step.node.title;
  els.objective.textContent = step.node.objective;
  els.phase.textContent = step.phase === 'assessment' ? 'Checkpoint' : 'Practice';
  els.phase.dataset.phase = step.phase;
  // "How much is left?" — the shortest path through this node is
  // mastery.n correct practices plus the checkpoint (if any).
  const puzzlesTotal = step.node.mastery.n + (step.node.assessment !== undefined ? 1 : 0);
  const puzzleNow =
    step.phase === 'assessment' ? puzzlesTotal : model.practiceProgress(state, step.node) + 1;
  els.puzzleCount.textContent = `Puzzle ${puzzleNow} of ${puzzlesTotal}`;
  els.prompt.textContent = step.exercise.prompt;
  els.meta.textContent = '';
  setActions();

  // Serve-time reject: nothing unverified ever reaches the learner.
  setFeedback('info', 'Checking this exercise against the truth core…');
  try {
    await verifyOnce(step.node, step.exercise);
  } catch (err) {
    setFeedback(
      'error',
      `This exercise failed verification and will not be shown. ${err instanceof Error ? err.message : err}`,
    );
    board.onSquareClick = null;
    board.render(EMPTY_BOARD_FEN);
    return;
  }

  if (step.exercise.kind === 'find-square') {
    playFindSquare(step, step.exercise);
  } else {
    playScenario(step, step.exercise);
  }
}

async function main(): Promise<void> {
  core = await loadCore();
  curriculum = theBasics();
  state = restoreState();
  buildShell();
  await showNext();
}

void main();
