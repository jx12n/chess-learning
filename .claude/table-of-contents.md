# Table of Contents — on-demand reference

Read this when a task needs layout, gates, seams, or setup. Content
here is an index; the sources of truth are the linked files.

## Layout

```
crates/truth-core/        Rust — THE source of chess truth
  src/engine.rs             standard rules (shakmaty movegen)
  src/scenario.rs           BOTH rules models (movement via attack
                            tables; standard via movegen, D1–D4), goals
                            incl. check family + survive, the greedy
                            opponent (D3), per-piece equivalence tests
                            (F1 discipline)
  src/lib.rs                WASM surface, {ok, data|error} envelope
packages/core/            TS face of the tool API
  src/types.ts              hand-mirrors serde types (finding F3 —
                            pinned by the wire-drift suite in
                            test/core.test.ts)
  wasm/                     built artifact, gitignored — rebuild from source
packages/curriculum/      curriculum as data + outer loop
  data/the-basics.json      the skill DAG (days 1–7 authored; check/mate
                            stubs; every node strand-tagged for the spiral)
  src/router.ts             outer loop (domain-blind): frontier() +
                            nextStep (one policy over it) + validation
                            incl. days and strands
  src/days.ts               day-pacing helpers (presentation-side grouping)
  src/simulate.ts           stateWhere: perfect-learner state synthesis
  src/learner.ts            mastery stub behind opaque LearnerState
packages/verifier/        BFS solvability + serve gate (assertServable,
                          refuses zero-move content — F6 closed)
packages/web/             play surface, inner loop, day chrome;
  index.html + src/home.ts  landing: hero micro-lesson + "Who's playing?"
  play.html → src/main.ts   the lesson (bounces to the door w/o a profile)
  about.html + src/about.ts the story page (day list from curriculum data)
  src/profiles.ts           player profiles: registry + per-profile state keys
  src/devpanel.ts           dev options (?dev=1): jump/sandbox/solve backstage
                          e2e: day1 / days / home / dev-mode specs
docs/
  architecture-review.md    findings F1–F7, ranked, with next steps
  retention-model.md        BKT/retention seam sketch (what's recorded now)
  curriculum/day-0*.md      human-readable lesson sheets, days 1–7
```

## Gate → command map

| Roadmap gate | Command |
|---|---|
| P0 — one WASM artifact, both hosts | `pnpm build:wasm` then `pnpm test` |
| P1/P2 — core correct (perft), scenarios playable | `pnpm test:rust` |
| P4/P5 — routing, learner, verifier accept/refuse | `pnpm test` |
| P5/P6 — every authored exercise solvable | `pnpm verify:curriculum` |
| P3/P6 — the Basics in a real browser | `pnpm build && pnpm --filter @chess/web e2e` |

CI (`.github/workflows/ci.yml`) runs all of them plus clippy
(`-D warnings`) and `pnpm typecheck`.

## Authoring checklist — new curriculum node

Derived from architecture-review F1/F6; treat as definition of done.
The full playbooks live in `.claude/skills/create-curriculum-day/` and
`.claude/skills/build-day-experience/`.

1. Movement-vs-standard equivalence test for the piece in
   `crates/truth-core` (shape of `movement_matches_real_rook_geometry`,
   including blocked and capture cases; pawns need several; document
   intentional divergences as their own tests) — *before* content.
2. Author exercises in `packages/curriculum/data/the-basics.json`;
   flip the node's `status` from `stub` to `active`; add the node to a
   `days[]` entry, place it on its `strand` (the band is all-or-nothing
   on strands) and give it `hints` (select/illegal copy). Budgets are
   tight: budget == shortest solution. Prompts explain every visual
   affordance the exercise relies on (star, red ring, counter).
3. `pnpm verify:curriculum` green — every exercise proven solvable with
   `minSolutionLength >= 1`; pin the minimum in the difficulty table.
4. New mechanics (goal type, opponent, rules model, promotion-like
   transforms, multi-piece) ⇒ extend the e2e.
5. Write the matching human lesson sheet in `docs/curriculum/`
   (runnable cold; diagrams mirror the real exercise FENs).

## Open seams (deferred, contract already in place)

See the table in [README.md](../README.md#seams-left-open-deferred-contracts-in-place).
Before opening one, read the matching finding in
[docs/architecture-review.md](../docs/architecture-review.md)
(F2 standard-rules scenarios, F3 generated wire types, F4 search
placement).

## First-time setup

```bash
rustup target add wasm32-unknown-unknown
npm install -g wasm-pack pnpm
pnpm install
pnpm build:wasm    # required first — the WASM artifact is gitignored
```

## Known cleverness (don't be surprised)

- The FEN fullmove counter doubles as the scenario budget clock (F5) —
  MOVEMENT MODEL ONLY (D4): standard rules use honest ply arithmetic.
  The verifier strips counters from its dedup key, and keys survive
  dedup on its own BFS depth — it never reads wire counters.
- The greedy opponent is deterministic by design (material gain incl.
  promotion, lexicographic-UCI tiebreak), so the verifier folds its
  replies into a single-agent BFS. Only `greedy` folds; a stochastic
  `engine` never may (that day is finding F4's minimax).
- Scenario failure reasons are a typed wire contract: `REASON_*` consts
  in scenario.rs ↔ `ScenarioFailureReason` in packages/core/src/types.ts
  — extend both together.
- The client verify-cache pins rejections for the session by design.
- The learner-model window forgets failures by design; real mastery
  modeling is the BKT seam's job.
- Board glyphs use the *filled* Unicode set for both colors; CSS paints
  White (`.white-piece`). e2e piece assertions expect ♜♝♛…, not ♖♗♕.
- e2e reaches later days by seeding localStorage with
  `model.serialize(stateWhere(...))` — synthesized through the model's
  own API, so seeds can never drift from the wire format.
- Player profiles: registry `chess-tutor/profiles/v1`; each player's
  state lives at `chess-tutor/learner-state/v1/<id>`. The lesson is at
  /play.html and bounces to the landing page without a selected
  profile, so e2e seeds the registry too. The bare pre-profile key
  (`…/v1`) is surfaced on the landing as a "saved game" card and MOVED
  under a profile when claimed.
- Dev mode: flag `chess-tutor/dev/v1`, profile
  `chess-tutor/learner-state/dev/v1` — the kid's key is never touched
  while the flag is on; the panel is DOM-absent when off. Enter at
  /play.html?dev=1 (dev needs no player profile).
