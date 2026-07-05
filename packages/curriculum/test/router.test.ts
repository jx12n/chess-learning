/**
 * P4 gate: an empty learner is routed board-orientation → rook-movement →
 * rook-capture; prereqs are enforced; stub nodes are never served.
 */
import { describe, expect, it } from 'vitest';
import {
  counterLearnerModel as model,
  dayForNode,
  frontier,
  nextDay,
  nextStep,
  theBasics,
  validateCurriculum,
  type Curriculum,
  type LearnerState,
} from '@chess/curriculum';

/** Complete a node's practice + assessment with all-correct answers. */
function masterCurrentNode(state: LearnerState): LearnerState {
  const curriculum = theBasics();
  const first = nextStep(curriculum, model, state);
  if (first.done) throw new Error('nothing to master');
  const nodeId = first.node.id;
  for (let guard = 0; guard < 50; guard++) {
    const step = nextStep(curriculum, model, state);
    if (step.done || step.node.id !== nodeId) return state;
    state = model.observe(state, {
      nodeId: step.node.id,
      exerciseId: step.exercise.id,
      correct: true,
      phase: step.phase,
    });
  }
  throw new Error(`node '${nodeId}' did not complete in 50 attempts`);
}

describe('outer loop routing (P4 gate)', () => {
  it('routes an empty learner to board-orientation first', () => {
    const step = nextStep(theBasics(), model, model.init());
    expect(step.done).toBe(false);
    if (!step.done) {
      expect(step.node.id).toBe('board-orientation');
      expect(step.phase).toBe('practice');
      expect(step.exercise.kind).toBe('find-square');
    }
  });

  it('routes through all seven days in authored order, then the band is done', () => {
    let state = model.init();
    const served: string[] = [];
    for (let i = 0; i < 20; i++) {
      const step = nextStep(theBasics(), model, state);
      if (step.done) break;
      served.push(step.node.id);
      state = masterCurrentNode(state);
    }
    expect(served).toEqual([
      'board-orientation',
      'rook-movement',
      'rook-capture',
      'bishop-movement',
      'bishop-capture',
      'queen-movement',
      'queen-capture',
      'knight-movement',
      'knight-capture',
      'pawn-march',
      'pawn-capture',
      'king-movement',
      'king-capture',
      'piece-values',
      'the-whole-army',
    ]);
    // Everything further (don't-hang, check, mates) is stubbed: done.
    expect(nextStep(theBasics(), model, state)).toEqual({ done: true });
  });

  it('never serves rook nodes before their prereqs are mastered', () => {
    const curriculum = theBasics();
    let state = model.init();
    // Fail a few attempts — still stuck on board-orientation.
    for (let i = 0; i < 4; i++) {
      const step = nextStep(curriculum, model, state);
      if (step.done) throw new Error('unexpected completion');
      expect(step.node.id).toBe('board-orientation');
      state = model.observe(state, {
        nodeId: step.node.id,
        exerciseId: step.exercise.id,
        correct: false,
        phase: step.phase,
      });
    }
  });

  it('requires the assessment after practice mastery', () => {
    const curriculum = theBasics();
    let state = model.init();
    // Four correct practice answers meet the 4-of-5 rule...
    for (let i = 0; i < 4; i++) {
      const step = nextStep(curriculum, model, state);
      if (step.done) throw new Error('unexpected completion');
      expect(step.phase).toBe('practice');
      state = model.observe(state, {
        nodeId: step.node.id,
        exerciseId: step.exercise.id,
        correct: true,
        phase: 'practice',
      });
    }
    // ...then the same node serves its assessment, not the next node.
    const check = nextStep(curriculum, model, state);
    expect(check.done).toBe(false);
    if (!check.done) {
      expect(check.node.id).toBe('board-orientation');
      expect(check.phase).toBe('assessment');
      expect(check.exercise.id).toBe('fs-check-g5');
    }
  });

  it('mastery survives a serialize/deserialize round trip', () => {
    let state = model.init();
    state = masterCurrentNode(state);
    const revived = model.deserialize(model.serialize(state));
    const step = nextStep(theBasics(), model, revived);
    expect(step.done).toBe(false);
    if (!step.done) expect(step.node.id).toBe('rook-movement');
  });

  it('the mastery window is sliding: early failures age out', () => {
    const curriculum = theBasics();
    let state = model.init();
    const answers = [false, false, true, true, true, true];
    for (const correct of answers) {
      const step = nextStep(curriculum, model, state);
      if (step.done) throw new Error('unexpected completion');
      state = model.observe(state, {
        nodeId: step.node.id,
        exerciseId: step.exercise.id,
        correct,
        phase: step.phase,
      });
    }
    // Last 5 attempts contain 4 correct → practice mastered → assessment.
    const step = nextStep(curriculum, model, state);
    if (step.done) throw new Error('unexpected completion');
    expect(step.phase).toBe('assessment');
  });
});

describe('the frontier (branch points)', () => {
  it('an empty learner has exactly one place to start', () => {
    const open = frontier(theBasics(), model, model.init());
    expect(open.map((n) => n.id)).toEqual(['board-orientation']);
  });

  it('mastering the board opens five pieces at once', () => {
    const state = masterCurrentNode(model.init());
    const open = frontier(theBasics(), model, state);
    expect(open.map((n) => n.id)).toEqual([
      'rook-movement',
      'bishop-movement',
      'knight-movement',
      'pawn-march',
      'king-movement',
    ]);
  });

  it('nextStep is the first-of-frontier policy, all the way to done', () => {
    const curriculum = theBasics();
    let state = model.init();
    for (let i = 0; i < 20; i++) {
      const open = frontier(curriculum, model, state);
      const step = nextStep(curriculum, model, state);
      if (step.done) {
        // done exactly when the frontier is empty
        expect(open).toEqual([]);
        return;
      }
      expect(open.length).toBeGreaterThan(0);
      expect(step.node.id).toBe(open[0]!.id);
      // stubs never surface on the frontier
      expect(open.every((n) => n.status === 'active')).toBe(true);
      state = masterCurrentNode(state);
    }
    throw new Error('band did not complete in 20 nodes');
  });

  it('a stub prereq blocks its active descendants off the frontier', () => {
    const blocked: Curriculum = {
      band: 'b',
      title: 'B',
      nodes: [
        {
          id: 'n1',
          title: 'N1',
          objective: '',
          prereqs: [],
          status: 'stub',
          mastery: { type: 'n-correct-of-m', n: 1, m: 1 },
          teaches: { kinds: ['find-square'] },
          exercises: [],
        },
        {
          id: 'n2',
          title: 'N2',
          objective: '',
          prereqs: ['n1'],
          status: 'active',
          mastery: { type: 'n-correct-of-m', n: 1, m: 1 },
          teaches: { kinds: ['find-square'] },
          exercises: ['e1'],
        },
      ],
      exercises: [{ kind: 'find-square', id: 'e1', prompt: 'p', square: 'a1' }],
    };
    // n2 is active and unmastered, but unauthored content gates it out.
    expect(frontier(blocked, model, model.init())).toEqual([]);
    expect(nextStep(blocked, model, model.init())).toEqual({ done: true });
  });
});

describe('practice progress (display scale)', () => {
  it('counts corrects in the sliding window, clamped to mastery.n', () => {
    const curriculum = theBasics();
    const node = curriculum.nodes.find((n) => n.id === 'board-orientation')!;
    let state = model.init();
    expect(model.practiceProgress(state, node)).toBe(0);

    // A failure earns no credit.
    state = model.observe(state, {
      nodeId: node.id,
      exerciseId: 'fs-e4',
      correct: false,
      phase: 'practice',
    });
    expect(model.practiceProgress(state, node)).toBe(0);

    // Three corrects → three credits (n=4 not yet reached).
    for (const ex of ['fs-a1', 'fs-h8', 'fs-c6']) {
      state = model.observe(state, {
        nodeId: node.id,
        exerciseId: ex,
        correct: true,
        phase: 'practice',
      });
    }
    expect(model.practiceProgress(state, node)).toBe(3);

    // The window slides (m=5): pile on failures until the corrects age out.
    for (let i = 0; i < 5; i++) {
      state = model.observe(state, {
        nodeId: node.id,
        exerciseId: 'fs-e4',
        correct: false,
        phase: 'practice',
      });
    }
    expect(model.practiceProgress(state, node)).toBe(0);
  });
});

describe('attempt timestamps (the retention seam records from day one)', () => {
  it('stores practice timestamps in the wire format, ignored by mastery', () => {
    let state = model.init();
    state = model.observe(state, {
      nodeId: 'board-orientation',
      exerciseId: 'fs-e4',
      correct: true,
      phase: 'practice',
      at: 1_700_000_000_000,
    });
    // No timestamp reported → recorded as null, arrays stay lockstep.
    state = model.observe(state, {
      nodeId: 'board-orientation',
      exerciseId: 'fs-a1',
      correct: false,
      phase: 'practice',
    });
    const wire = JSON.parse(model.serialize(state)) as {
      nodes: Record<string, { practice: boolean[]; practiceAt?: Array<number | null> }>;
    };
    expect(wire.nodes['board-orientation']!.practice).toEqual([true, false]);
    expect(wire.nodes['board-orientation']!.practiceAt).toEqual([1_700_000_000_000, null]);
  });

  it('states saved before timestamps existed still load and stay aligned', () => {
    // A v1 blob exactly as the pre-timestamp model wrote it.
    const legacy = JSON.stringify({
      version: 1,
      nodes: { 'board-orientation': { practice: [true, true], assessmentPassed: false } },
    });
    let state = model.deserialize(legacy);
    const node = theBasics().nodes.find((n) => n.id === 'board-orientation')!;
    expect(model.practiceProgress(state, node)).toBe(2);

    state = model.observe(state, {
      nodeId: 'board-orientation',
      exerciseId: 'fs-h8',
      correct: true,
      phase: 'practice',
      at: 42,
    });
    const wire = JSON.parse(model.serialize(state)) as {
      nodes: Record<string, { practice: boolean[]; practiceAt?: Array<number | null> }>;
    };
    // Pre-timestamp history pads with null; the new attempt is stamped.
    expect(wire.nodes['board-orientation']!.practice).toEqual([true, true, true]);
    expect(wire.nodes['board-orientation']!.practiceAt).toEqual([null, null, 42]);
  });

  it('assessment attempts keep pass/fail only; practice timestamps survive', () => {
    let state = model.init();
    state = model.observe(state, {
      nodeId: 'board-orientation',
      exerciseId: 'fs-e4',
      correct: true,
      phase: 'practice',
      at: 7,
    });
    state = model.observe(state, {
      nodeId: 'board-orientation',
      exerciseId: 'fs-check-g5',
      correct: true,
      phase: 'assessment',
      at: 9,
    });
    const wire = JSON.parse(model.serialize(state)) as { nodes: Record<string, unknown> };
    // Exact shape: the assessment stored no timestamp/latency/hints
    // (accepted loss, documented in docs/retention-model.md) and left
    // the practice capture arrays intact.
    expect(wire.nodes['board-orientation']).toEqual({
      practice: [true],
      practiceAt: [7],
      practiceLatencyMs: [null],
      practiceHints: [null],
      assessmentPassed: true,
    });
  });

  it('captures latency and hint counts lockstep with practice (H)', () => {
    let state = model.init();
    // Pre-capture history: no latency/hints reported.
    state = model.observe(state, {
      nodeId: 'board-orientation',
      exerciseId: 'fs-e4',
      correct: false,
      phase: 'practice',
    });
    // Instrumented attempt: everything reported.
    state = model.observe(state, {
      nodeId: 'board-orientation',
      exerciseId: 'fs-e4',
      correct: true,
      phase: 'practice',
      at: 42,
      latencyMs: 5200,
      hintCount: 2,
    });
    const wire = JSON.parse(model.serialize(state)) as {
      nodes: Record<
        string,
        {
          practice: boolean[];
          practiceLatencyMs?: Array<number | null>;
          practiceHints?: Array<number | null>;
        }
      >;
    };
    const node = wire.nodes['board-orientation']!;
    // Lockstep with practice[]: unreported history pads with null, the
    // instrumented attempt lands verbatim — captured, read by nothing yet.
    expect(node.practice).toEqual([false, true]);
    expect(node.practiceLatencyMs).toEqual([null, 5200]);
    expect(node.practiceHints).toEqual([null, 2]);
  });

  it('a drifted practiceAt (shorter than practice) self-heals on the next write', () => {
    // As an older bundle sharing the v1 wire format could leave it.
    const drifted = JSON.stringify({
      version: 1,
      nodes: {
        'board-orientation': { practice: [true, true], practiceAt: [5], assessmentPassed: false },
      },
    });
    let state = model.deserialize(drifted);
    state = model.observe(state, {
      nodeId: 'board-orientation',
      exerciseId: 'fs-h8',
      correct: true,
      phase: 'practice',
      at: 42,
    });
    const wire = JSON.parse(model.serialize(state)) as {
      nodes: Record<string, { practice: boolean[]; practiceAt?: Array<number | null> }>;
    };
    expect(wire.nodes['board-orientation']!.practice).toEqual([true, true, true]);
    expect(wire.nodes['board-orientation']!.practiceAt).toEqual([5, null, 42]);
  });
});

describe('curriculum data integrity', () => {
  it('every node sits on a spiral strand', () => {
    const curriculum = theBasics();
    for (const node of curriculum.nodes) {
      expect(node.strand, `node '${node.id}' has no strand`).toBeTruthy();
    }
    expect(new Set(curriculum.nodes.map((n) => n.strand))).toEqual(
      new Set(['board-vision', 'piece-play', 'value', 'teamwork', 'king-safety']),
    );
  });

  it('the-basics validates: days 1–7 active, check/mate territory stubbed', () => {
    const curriculum = theBasics();
    const active = curriculum.nodes.filter((n) => n.status === 'active');
    expect(active).toHaveLength(15);
    expect(curriculum.days).toHaveLength(7);
    // Day pacing covers exactly the active nodes, in serving order.
    expect(curriculum.days!.flatMap((d) => d.nodes)).toEqual(
      active.map((n) => n.id),
    );
    // The deferred seams still shape the DAG.
    const stubs = curriculum.nodes.filter((n) => n.status === 'stub');
    expect(stubs.map((n) => n.id)).toEqual([
      'dont-hang-pieces',
      'check-and-escaping-check',
      'basic-mates',
    ]);
  });

  it('day helpers resolve pacing from the data', () => {
    const curriculum = theBasics();
    const day2 = dayForNode(curriculum, 'bishop-capture');
    expect(day2?.day).toBe(2);
    expect(day2 && nextDay(curriculum, day2)?.day).toBe(3);
    const last = dayForNode(curriculum, 'the-whole-army')!;
    expect(nextDay(curriculum, last)).toBeNull();
    expect(dayForNode(curriculum, 'basic-mates')).toBeNull();
  });
});

describe('day pacing validation', () => {
  const minimal = (): Curriculum => ({
    band: 'b',
    title: 'B',
    nodes: [
      {
        id: 'n1',
        title: 'N1',
        objective: '',
        prereqs: [],
        status: 'active',
        mastery: { type: 'n-correct-of-m', n: 1, m: 1 },
        teaches: { kinds: ['find-square'] },
        exercises: ['e1'],
      },
      {
        id: 'n2',
        title: 'N2',
        objective: '',
        prereqs: ['n1'],
        status: 'active',
        mastery: { type: 'n-correct-of-m', n: 1, m: 1 },
        teaches: { kinds: ['find-square'] },
        exercises: ['e1'],
      },
    ],
    exercises: [{ kind: 'find-square', id: 'e1', prompt: 'p', square: 'a1' }],
    days: [
      { day: 1, title: 'D1', nodes: ['n1'], wrapUp: 'w', teaser: 't' },
      { day: 2, title: 'D2', nodes: ['n2'], wrapUp: 'w', teaser: 't' },
    ],
  });

  it('accepts a well-formed day plan', () => {
    expect(validateCurriculum(minimal())).toEqual([]);
  });

  it('rejects an active node that belongs to no day', () => {
    const c = minimal();
    c.days![1] = { ...c.days![1]!, nodes: [] };
    const problems = validateCurriculum(c);
    expect(problems.join('\n')).toMatch(/belongs to no day/);
    expect(problems.join('\n')).toMatch(/day 2 has no nodes/);
  });

  it('rejects unknown nodes, duplicates and non-ascending day numbers', () => {
    const c = minimal();
    c.days = [
      { day: 2, title: 'D2', nodes: ['n1', 'ghost'], wrapUp: 'w', teaser: 't' },
      { day: 2, title: 'D2 again', nodes: ['n1', 'n2'], wrapUp: 'w', teaser: 't' },
    ];
    const problems = validateCurriculum(c).join('\n');
    expect(problems).toMatch(/unknown node 'ghost'/);
    expect(problems).toMatch(/appears in day 2 and day 2/);
    expect(problems).toMatch(/day numbers must ascend/);
  });

  it('rejects day order that contradicts the band serving order', () => {
    const c = minimal();
    c.days = [
      { day: 1, title: 'D1', nodes: ['n2'], wrapUp: 'w', teaser: 't' },
      { day: 2, title: 'D2', nodes: ['n1'], wrapUp: 'w', teaser: 't' },
    ];
    expect(validateCurriculum(c).join('\n')).toMatch(
      /does not match the band serving order/,
    );
  });
});

describe('strand validation', () => {
  const minimal = (): Curriculum => ({
    band: 'b',
    title: 'B',
    nodes: [
      {
        id: 'n1',
        title: 'N1',
        objective: '',
        prereqs: [],
        status: 'active',
        mastery: { type: 'n-correct-of-m', n: 1, m: 1 },
        teaches: { kinds: ['find-square'] },
        exercises: ['e1'],
      },
      {
        id: 'n2',
        title: 'N2',
        objective: '',
        prereqs: ['n1'],
        status: 'active',
        mastery: { type: 'n-correct-of-m', n: 1, m: 1 },
        teaches: { kinds: ['find-square'] },
        exercises: ['e1'],
      },
    ],
    exercises: [{ kind: 'find-square', id: 'e1', prompt: 'p', square: 'a1' }],
    days: [
      { day: 1, title: 'D1', nodes: ['n1'], wrapUp: 'w', teaser: 't' },
      { day: 2, title: 'D2', nodes: ['n2'], wrapUp: 'w', teaser: 't' },
    ],
  });

  it('a band without strands is fine; a band with them is all-or-nothing', () => {
    expect(validateCurriculum(minimal())).toEqual([]);

    // Strand names are opaque to this layer — any non-empty tag works.
    const c = minimal();
    c.nodes[0]!.strand = 'strand-a';
    expect(validateCurriculum(c).join('\n')).toMatch(
      /node 'n2' has no strand, but the band uses strands/,
    );

    c.nodes[1]!.strand = 'strand-b';
    expect(validateCurriculum(c)).toEqual([]);
  });

  it('rejects an empty strand', () => {
    const c = minimal();
    c.nodes[0]!.strand = '  ';
    c.nodes[1]!.strand = 'strand-b';
    expect(validateCurriculum(c).join('\n')).toMatch(
      /node 'n1': strand must not be empty/,
    );
  });

  it('stub nodes need strands too — they shape the spiral', () => {
    const c = minimal();
    c.nodes[0]!.strand = 'strand-a';
    c.nodes[1]!.strand = 'strand-b';
    c.nodes.push({
      id: 'n3',
      title: 'N3',
      objective: '',
      prereqs: ['n2'],
      status: 'stub',
      mastery: { type: 'n-correct-of-m', n: 1, m: 1 },
      teaches: { kinds: ['find-square'] },
      exercises: [],
    });
    expect(validateCurriculum(c).join('\n')).toMatch(
      /node 'n3' has no strand, but the band uses strands/,
    );
  });
});
