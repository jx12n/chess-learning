---
name: create-curriculum-day
description: Author ONE new curriculum day for the chess tutor end-to-end — per-piece equivalence tests BEFORE content, nodes/exercises/day-plan/hints as data, verifier-proven solvability with tight budgets, and the parent-coach lesson sheet. Use when adding a day to the Basics band, activating a stub node, authoring new exercises, or asked to "author day N" / "add the <piece> lessons". Hands play-surface work (new mechanics, e2e, copy wiring) to the build-day-experience skill.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
argument-hint: [day number + theme, e.g. "day 8: two rooks teamwork"]
---

# Create Curriculum Day

## Directive

You are dispatched to do the following:

1. Read `CLAUDE.md`, the authoring checklist in `.claude/table-of-contents.md`, the current `packages/curriculum/data/the-basics.json`, and one existing sheet in `docs/curriculum/` (day-02 is a good exemplar).
2. State the day's scope in one sentence: ONE theme, normally two nodes (a movement node + a capture node — the Race→Gobble ritual). Gate on the Step Back below before writing anything.
3. **Tests before content (F1).** For each piece/mechanic the day teaches, add a movement-vs-standard equivalence test in `crates/truth-core/src/scenario.rs` — shape of `movement_matches_real_rook_geometry`, with a blocked line (own piece) and a capture (enemy piece); pawns need several. Any *intentional* divergence from standard chess gets its own named test. Read `${CLAUDE_SKILL_DIR}/reference/equivalence-tests.md` first.
4. Run `pnpm test:rust` (must exit 0), then `pnpm build:wasm`.
5. Author the data in `packages/curriculum/data/the-basics.json`:
   - Nodes: `id`, `title`, `objective`, `prereqs` (everything the exercises rely on), `status: "active"`, `mastery` (default `n:2, m:3`), `teaches` (pieces + goalTypes), `exercises` (3 practice ids), `assessment` (1 checkpoint id), `hints` (`select` + `illegal`, child voice).
   - Exercises: 4 per node, following the arc and FEN rules in `${CLAUDE_SKILL_DIR}/reference/exercise-authoring.md`.
   - A `days[]` entry: `day`, `title`, `nodes` (in serving order), `wrapUp`, `teaser`.
   - Node array order must equal day order — `validateCurriculum` enforces it.
6. Run `pnpm verify:curriculum`. Fix FENs/budgets until every exercise is valid, solvable, on-target with `minSolutionLength >= 1`. If the search found a shorter solution than you designed, tighten the budget to the proven minimum — never widen it.
7. Pin intent in `packages/verifier/test/verify-curriculum.test.ts`: add each budgeted exercise to the difficulty `it.each` table. (The band-wide budget==shortest test covers tightness automatically.)
8. Update the expected active-node list in `packages/curriculum/test/router.test.ts`; run `pnpm test`.
9. If the day introduces a mechanic the play surface has never rendered (new goal type, opponent, rules model, transform, multi-piece), invoke the `build-day-experience` skill — do not extend `packages/web` from here.
10. Write `docs/curriculum/day-0N.md` from `${CLAUDE_SKILL_DIR}/templates/lesson-sheet.md`. Every ASCII diagram mirrors a real authored `startFEN`.
11. Update the curriculum-status section of `README.md`.
12. Run the full gate set and the Verification Checklist below.

## Step Back: before scoping (step 2)

> "Would van Wijgerden ship this day?"

- Is it ONE concept a 7-year-old can hold? If the theme needs two sentences, it is two days.
- Are all prereqs already `active`? A day cannot depend on a stub.
- Does the movement model already express the mechanic? Check semantics, en passant and promotion-choice do **not** exist in `rules: "movement"`. If the day needs them, stop: that is the F2 `rules: "standard"` seam (see `docs/architecture-review.md`), not a day-authoring job.

## Step Back: before verifying (step 6)

> "Is the puzzle honest?"

- Could a learner already be done at the start position? (The gate refuses `minSolutionLength 0`, but don't rely on it to catch near-trivial puzzles.)
- Does the budget teach efficiency, or punish exploration? Budget the "efficiency round" and checkpoint puzzles; leave the first gobble of a node unbudgeted for joy.
- Is every decoy reachable and every position chess-natural? (No pawns on ranks 1/8, kings only as scenery.)

## Verification Checklist

- [ ] `pnpm test:rust` exits 0 and `grep -n "movement_matches_real_<piece>" crates/truth-core/src/scenario.rs` finds the new test(s).
- [ ] `pnpm verify:curriculum` exits 0 (every new exercise listed as passing).
- [ ] `grep -n '"day": <N>' packages/curriculum/data/the-basics.json` finds the day entry; each new node id appears in both `nodes` and the day's `nodes` list.
- [ ] Every new budgeted exercise id appears in the difficulty table of `packages/verifier/test/verify-curriculum.test.ts`.
- [ ] `pnpm test` and `pnpm typecheck` exit 0.
- [ ] `ls docs/curriculum/day-0<N>.md` succeeds, and every exercise id cited in the sheet exists in `the-basics.json` (`grep` each).
- [ ] `grep -n "<new-node-id>" README.md` finds the curriculum-status update.
- [ ] If step 9 fired: `build-day-experience` was invoked (its own checklist covers the play surface and e2e).

## Constraints

- NEVER author content for a piece/mechanic before its equivalence test exists and passes (F1).
- NEVER hardcode lesson copy in TS — prompts, hints, wrap-ups, teasers are data.
- NEVER weaken `verify:curriculum`, `assertServable`, or the tightness test to make content pass — fix the content.
- ALWAYS write scenario FENs with counters `0 1` — the fullmove counter is the budget clock (F5).
- ALWAYS run `pnpm build:wasm` after touching `crates/`.

## Files in this skill

| File | Purpose |
|---|---|
| `reference/equivalence-tests.md` | How to build the F1 test for each piece: parked-kings rules, divergence tests, pawn coverage |
| `reference/exercise-authoring.md` | Exercise arc, FEN rules, budgets, hints, prompt-affordance rules (playtest-derived) |
| `reference/anti-patterns.md` | Authoring mistakes that verification catches late or never |
| `templates/lesson-sheet.md` | Scaffold for `docs/curriculum/day-0N.md` |
