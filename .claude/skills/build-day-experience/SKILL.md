---
name: build-day-experience
description: Turn an authored, verifier-proven curriculum day into a working in-app experience — inventory new mechanics, keep all lesson copy in data, extend the inner loop only where the core demands it, prove it in browser e2e, then walk it as the learner. Use when a new day's data exists but the app can't serve it well, when a day introduces a mechanic the play surface never rendered (new goal type, transform, multi-piece, opponent), or after create-curriculum-day hands off. Consumes create-curriculum-day's output; never authors curriculum content itself.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
argument-hint: [day number or mechanic, e.g. "day 5 promotion"]
---

# Build Day Experience

## Directive

You are dispatched to do the following:

1. Confirm the day's data is in and proven: `pnpm verify:curriculum` exits 0 and the day exists in `packages/curriculum/data/the-basics.json` (`days[]` entry + active nodes). If not, stop and run `create-curriculum-day` first.
2. **Inventory new mechanics.** Diff the day's exercises against what `packages/web/src/main.ts` already renders. Read `${CLAUDE_SKILL_DIR}/reference/mechanics-inventory.md` for the checklist of mechanic classes and which ones the surface already handles. Gate on the Step Back below.
3. **Copy audit.** Every learner-facing sentence for the day must come from data: exercise `prompt`, node `hints.select`/`hints.illegal`, day `wrapUp`/`teaser`, band `complete`. `grep -n "rook\|bishop\|queen\|knight\|pawn\|king" packages/web/src/main.ts` — piece names in TS (outside comments) mean hardcoded lesson copy; move it into the node's `hints`.
4. For each genuinely new mechanic, extend the inner loop in `packages/web/src/main.ts` following the rules in `${CLAUDE_SKILL_DIR}/reference/play-surface-rules.md` — the UI renders FEN placement, maps clicks, and narrates what the core reports; it never decides a chess fact.
5. Extend the browser gate in `packages/web/e2e/days.spec.ts`: reach the day by seeding learner state (`masteredState` helper), walk the shortest mastery path with real clicks, and assert each new mechanic's observable effect (board glyphs use the FILLED set ♜♝♛ for both colors — assert `.white-piece` class for color). Day-boundary and band-complete assertions follow the existing specs' shape.
6. Run the gates: `pnpm typecheck && pnpm test && pnpm build && pnpm --filter @chess/web e2e` — all must exit 0 (plus `pnpm test:rust && pnpm build:wasm` if `crates/` changed).
7. **Operator walk.** Start `pnpm dev`, open the app, and play the day as the learner would (seed localStorage with the e2e `masteredState` format to jump there). Check against `${CLAUDE_SKILL_DIR}/reference/operator-walk.md` — the playtest-derived checklist. Capture screenshots if the walk is remote/scripted.
8. Fix what the walk finds, re-run step 6, and complete the Verification Checklist.

## Step Back: after the mechanics inventory (step 2)

> "Is this a rendering job or a seam-opening job?"

- If the mechanic needs `rules: "standard"` (check display, mate) or `opponent: "engine"`, STOP — those are architecture seams (F2, opponent) with their own decision process in `docs/architecture-review.md`, not day work.
- If the mechanic is expressible as data the surface already renders (a goal type it knows, budget flavor, piece mix), the answer is usually zero app code — resist inventing UI.
- Can the new code state its chess claim as a core call? If a line of TS would *decide* anything (legality, goal, transform), it belongs in `crates/truth-core`, not here.

## Step Back: before extending e2e (step 5)

> "Does this spec fail when the experience breaks?"

- Would the spec still pass if the new mechanic silently stopped rendering? Assert the observable effect (glyph, class, feedback text), not just "no crash".
- Is the seeded state honest? `masteredState` mirrors the learner-state v1 wire format — if `learner.ts` versions its format, the seed must be bumped with it.

## Verification Checklist

- [ ] `pnpm verify:curriculum` exits 0 (precondition intact).
- [ ] `grep -cn "hints" packages/curriculum/data/the-basics.json` covers every scenario node of the day (select + illegal present).
- [ ] No piece-specific lesson copy in TS: piece-name grep of `packages/web/src/main.ts` hits only comments/fallback-generic strings.
- [ ] `packages/web/e2e/days.spec.ts` contains a test that reaches the day (seed or click-through) and asserts each new mechanic's observable effect.
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm --filter @chess/web e2e` all exit 0.
- [ ] Operator walk done: each item in `reference/operator-walk.md` checked for the new day.
- [ ] If `crates/` changed: `pnpm test:rust` exits 0 and `pnpm build:wasm` re-run.
- [ ] Docs touched if behavior changed: `.claude/table-of-contents.md` known-cleverness/e2e notes still true.

## Constraints

- NEVER decide a chess fact in the web layer — every legality, goal, and transform is a core call.
- NEVER hardcode lesson content in TS; generic fallbacks only, overridden by node `hints` data.
- NEVER bypass `assertServable` in the serve path, even "temporarily".
- ALWAYS keep `router.ts`/`learner.ts` chess-blind — day chrome reads `days[]` data, never piece knowledge.
- ALWAYS end with the operator walk; green gates without the walk is not done.

## Files in this skill

| File | Purpose |
|---|---|
| `reference/mechanics-inventory.md` | Mechanic classes; what the surface already renders vs what needs code |
| `reference/play-surface-rules.md` | Inner-loop extension rules; where copy lives; day-chrome data flow |
| `reference/operator-walk.md` | The playtest-derived walk checklist (counter, affordances, legibility, tone) |
