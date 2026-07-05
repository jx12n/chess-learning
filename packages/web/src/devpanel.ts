/**
 * Developer options — the backstage drawer.
 *
 * Everything here goes through the front door: jumps synthesize a REAL
 * LearnerState via `stateWhere` (a simulated perfect learner driving the
 * public model API), sandbox play runs the normal players behind the
 * normal serve gate, and "solve" replays the verifier's proven solution
 * by clicking the same squares a learner would. No router bypass, no
 * gate bypass, no forged state — the panel can only reach states and
 * outcomes the product itself supports.
 *
 * The panel is chess-blind: it renders curriculum data (days, nodes,
 * exercises) and calls hooks the lesson driver provides.
 */

import {
  nextDay,
  stateWhere,
  type Curriculum,
  type DayPlan,
  type Exercise,
  type LearnerModel,
  type LearnerState,
  type SkillNode,
} from '@chess/curriculum';
import type { VerifyReport } from '@chess/verifier';

/** What the panel shows about the currently rendered screen. */
export interface DevSnapshot {
  kind: 'lesson' | 'sandbox' | 'day-complete' | 'band-complete' | 'none';
  dayLabel: string;
  node?: SkillNode;
  phase?: string;
  exercise?: Exercise;
  attempts?: number;
  /** e.g. "1/2" — practice progress toward mastery.n. */
  progress?: string;
}

/** Capabilities the lesson driver lends the panel. */
export interface DevHooks {
  curriculum: Curriculum;
  model: LearnerModel;
  snapshot(): DevSnapshot;
  /** Adopt a synthesized state; `lastDay` primes the interstitial logic. */
  applyState(state: LearnerState, lastDay: number | null): void;
  /** Play one exercise without recording anything (serve gate still runs). */
  playSandbox(node: SkillNode, ex: Exercise): Promise<void>;
  /** Re-render whatever is current, board reset to its start. */
  replay(): Promise<void>;
  /** The serve-gate report (cached); rejects when the gate refuses. */
  verifyReport(node: SkillNode, ex: Exercise): Promise<VerifyReport>;
  /** Exactly a learner's click on a square. */
  clickSquare(square: string): void;
  serializeState(): string;
  exitDev(): void;
}

const SOLVE_CLICK_MS = 300;

export function initDevPanel(hooks: DevHooks): () => void {
  const { curriculum, model } = hooks;
  const days = curriculum.days ?? [];
  let selectedDay: number | null = null;

  const root = document.createElement('aside');
  root.id = 'dev-panel';
  root.innerHTML = `
    <div class="dev-bar">
      <strong>DEV</strong>
      <span id="dev-readout"></span>
      <button type="button" id="dev-toggle" title="Collapse (Ctrl+Shift+D)">▾</button>
    </div>
    <div class="dev-body">
      <div class="dev-row" id="dev-days"></div>
      <div class="dev-row" id="dev-nodes"></div>
      <div class="dev-row" id="dev-exercises"></div>
      <div class="dev-row">
        <button type="button" id="dev-solve">Solve current</button>
        <button type="button" id="dev-copy">Copy state</button>
        <button type="button" id="dev-exit">Exit dev mode</button>
        <span id="dev-verify"></span>
      </div>
      <textarea id="dev-state-json" readonly hidden rows="3"></textarea>
      <div id="dev-error" role="alert"></div>
    </div>
  `;
  document.body.appendChild(root);

  const el = (id: string): HTMLElement => root.querySelector<HTMLElement>(`#${id}`)!;
  const error = (msg: string): void => {
    el('dev-error').textContent = msg;
  };

  const jump = (match: Parameters<typeof stateWhere>[2], lastDay: number | null): void => {
    error('');
    try {
      hooks.applyState(stateWhere(curriculum, model, match), lastDay);
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
    }
  };

  const button = (id: string, label: string, onClick: () => void, cls = ''): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.id = id;
    b.textContent = label;
    if (cls) b.className = cls;
    b.addEventListener('click', onClick);
    return b;
  };

  /* ------------------------------ jump rows ------------------------------ */

  const renderDays = (): void => {
    const row = el('dev-days');
    row.innerHTML = '<span class="dev-label">jump</span>';
    for (const d of days) {
      row.appendChild(
        button(`dev-day-${d.day}`, `Day ${d.day}`, () => {
          selectedDay = d.day;
          jump({ nodeId: d.nodes[0]! }, d.day);
        }, selectedDay === d.day ? 'dev-selected' : ''),
      );
    }
    row.appendChild(button('dev-complete', 'Band complete', () => jump({ done: true }, null)));
  };

  const renderNodes = (): void => {
    const row = el('dev-nodes');
    row.innerHTML = '';
    const day = days.find((d) => d.day === selectedDay);
    if (!day) return;
    row.innerHTML = '<span class="dev-label">nodes</span>';
    for (const id of day.nodes) {
      const node = curriculum.nodes.find((n) => n.id === id)!;
      const group = document.createElement('span');
      group.className = 'dev-group';
      group.append(`${node.title} `);
      group.appendChild(button(`dev-node-${id}-fresh`, 'fresh', () => jump({ nodeId: id }, day.day)));
      if (node.assessment !== undefined) {
        group.appendChild(
          button(`dev-node-${id}-check`, 'checkpoint', () =>
            jump({ nodeId: id, phase: 'assessment' }, day.day),
          ),
        );
      }
      row.appendChild(group);
    }
    const next = nextDay(curriculum, day);
    if (next) {
      row.appendChild(
        button(`dev-wrapup-${day.day}`, `Day ${day.day} wrap-up`, () =>
          jump({ nodeId: next.nodes[0]! }, day.day),
        ),
      );
    }
  };

  const renderExercises = (): void => {
    const row = el('dev-exercises');
    row.innerHTML = '';
    const day = days.find((d) => d.day === selectedDay);
    if (!day) return;
    row.innerHTML = '<span class="dev-label">sandbox</span>';
    for (const id of day.nodes) {
      const node = curriculum.nodes.find((n) => n.id === id)!;
      const ids = [...node.exercises, ...(node.assessment ? [node.assessment] : [])];
      for (const exId of ids) {
        const ex = curriculum.exercises.find((e) => e.id === exId)!;
        row.appendChild(
          button(`dev-ex-${exId}`, exId, () => {
            error('');
            void hooks.playSandbox(node, ex);
          }),
        );
      }
    }
  };

  /* ------------------------------- actions ------------------------------- */

  el('dev-solve').addEventListener('click', () => {
    void (async () => {
      error('');
      const snap = hooks.snapshot();
      if ((snap.kind !== 'lesson' && snap.kind !== 'sandbox') || !snap.node || !snap.exercise) {
        error('nothing solvable on screen');
        return;
      }
      const { node, exercise } = snap;
      try {
        await hooks.replay(); // fresh board — the proven solution starts at move 1
        if (exercise.kind === 'find-square') {
          hooks.clickSquare(exercise.square);
          return;
        }
        const report = await hooks.verifyReport(node, exercise);
        const path = report.solutions[0] ?? [];
        for (const uci of path) {
          hooks.clickSquare(uci.slice(0, 2));
          await sleep(SOLVE_CLICK_MS);
          hooks.clickSquare(uci.slice(2, 4));
          await sleep(SOLVE_CLICK_MS);
        }
      } catch (err) {
        error(err instanceof Error ? err.message : String(err));
      }
    })();
  });

  el('dev-copy').addEventListener('click', () => {
    const area = el('dev-state-json') as HTMLTextAreaElement;
    area.hidden = !area.hidden;
    if (!area.hidden) {
      area.value = hooks.serializeState();
      area.select();
    }
  });

  el('dev-exit').addEventListener('click', hooks.exitDev);

  const toggle = (): void => {
    root.dataset.collapsed = root.dataset.collapsed === 'true' ? 'false' : 'true';
  };
  el('dev-toggle').addEventListener('click', toggle);
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') toggle();
  });

  /* ------------------------------- refresh ------------------------------- */

  const refresh = (): void => {
    const snap = hooks.snapshot();
    if (selectedDay === null) {
      selectedDay = Number(/^Day (\d+)/.exec(snap.dayLabel)?.[1] ?? days[0]?.day ?? 1);
    }
    const parts = [snap.dayLabel, snap.kind];
    if (snap.node) parts.push(snap.node.id);
    if (snap.phase) parts.push(snap.phase);
    if (snap.exercise) parts.push(snap.exercise.id);
    if (snap.attempts !== undefined) parts.push(`attempts ${snap.attempts}`);
    if (snap.progress) parts.push(`progress ${snap.progress}`);
    el('dev-readout').textContent = parts.filter(Boolean).join(' · ');

    el('dev-verify').textContent = '';
    if ((snap.kind === 'lesson' || snap.kind === 'sandbox') && snap.node && snap.exercise) {
      const target = snap.exercise.id;
      hooks.verifyReport(snap.node, snap.exercise).then(
        (r) => {
          if (hooks.snapshot().exercise?.id !== target) return; // stale
          el('dev-verify').textContent =
            `verified: min ${r.minSolutionLength} · ${r.unique ? 'unique' : 'multiple'} · ` +
            `${r.solutions[0]?.join(' ') ?? '—'}`;
        },
        (err) => {
          if (hooks.snapshot().exercise?.id !== target) return;
          el('dev-verify').textContent = `REFUSED: ${err instanceof Error ? err.message : err}`;
        },
      );
    }
    renderDays();
    renderNodes();
    renderExercises();
  };

  refresh();
  return refresh;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
