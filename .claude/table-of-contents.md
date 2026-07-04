# Table of Contents — on-demand reference

Read this when a task needs layout, gates, seams, or setup. Content
here is an index; the sources of truth are the linked files.

## Layout

```
crates/truth-core/        Rust — THE source of chess truth
  src/engine.rs             standard rules (shakmaty movegen)
  src/scenario.rs           movement model (shakmaty attack tables) + goals
  src/lib.rs                WASM surface, {ok, data|error} envelope
packages/core/            TS face of the tool API
  src/types.ts              hand-mirrors serde types (finding F3)
  wasm/                     built artifact, gitignored — rebuild from source
packages/curriculum/      curriculum as data + outer loop
  data/the-basics.json      the skill DAG (Day 1 authored, rest stubs)
  src/router.ts             outer loop (domain-blind)
  src/learner.ts            mastery stub behind opaque LearnerState
packages/verifier/        BFS solvability + serve gate (assertServable)
packages/web/             play surface, inner loop, e2e/day1.spec.ts
docs/
  architecture-review.md    findings F1–F7, ranked, with next steps
  curriculum/day-01.md      human-readable Day 1 lesson sheet
```

## Gate → command map

| Roadmap gate | Command |
|---|---|
| P0 — one WASM artifact, both hosts | `pnpm build:wasm` then `pnpm test` |
| P1/P2 — core correct (perft), scenarios playable | `pnpm test:rust` |
| P4/P5 — routing, learner, verifier accept/refuse | `pnpm test` |
| P5/P6 — every authored exercise solvable | `pnpm verify:curriculum` |
| P3/P6 — Day 1 in a real browser | `pnpm build && pnpm --filter @chess/web e2e` |

CI (`.github/workflows/ci.yml`) runs all of them plus clippy
(`-D warnings`) and `pnpm typecheck`.

## Authoring checklist — new curriculum node

Derived from architecture-review F1/F6; treat as definition of done.

1. Movement-vs-standard equivalence test for the piece in
   `crates/truth-core` (shape of `movement_matches_real_rook_geometry`,
   including blocked and capture cases; pawns need several) — *before*
   content.
2. Author exercises in `packages/curriculum/data/the-basics.json`;
   flip the node's `status` from `stub` to `active`.
3. `pnpm verify:curriculum` green — every exercise proven solvable with
   `minSolutionLength >= 1`.
4. New mechanics (goal type, opponent, rules model) ⇒ extend the e2e.
5. Write the matching human lesson sheet in `docs/curriculum/`.

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

- The FEN fullmove counter doubles as the scenario budget clock (F5);
  the verifier strips counters from its dedup key to compensate.
- The client verify-cache pins rejections for the session by design.
- The learner-model window forgets failures by design; real mastery
  modeling is the BKT seam's job.
