---
name: create-curriculum-day
description: Design and author curriculum days for the chess tutor, SHEET-FIRST — the parent-coach lesson sheet in docs/curriculum/ is the day's design spec and is written before any code or data. Accepts one day or a range ("8-14"). Days whose mechanics the core already expresses then get the full build pipeline (equivalence tests → data → verifier-proven solvability → sheet reconcile); days that need an unopened seam (check semantics, an opponent, a new exercise kind) STOP after the sheet with the dependency named — this skill never implements core seams. Use when asked to "author day N", "plan days N-M", or activate a stub node. Hands play-surface work to build-day-experience.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
argument-hint: [day or range + theme, e.g. "day 8: danger" or "8-14"]
---

# Create Curriculum Day

## The one rule that orders everything

**The sheet is the spec.** `docs/curriculum/day-0N.md` is written FIRST,
before tests, data, or code. It fixes the day's concept, script, positions
and copy in the child's and parent's language; the build pipeline then
makes the app match the sheet — never the reverse. A day can exist for
weeks as a sheet the family already plays on a real board while the app
catches up. That is a feature, not a gap.

## Directive

You are dispatched in two phases. Phase A always runs. Phase B runs only
for days whose every mechanic the core already expresses.

### Phase A — Design (docs only; always possible)

1. Read `CLAUDE.md`, the authoring checklist in
   `.claude/table-of-contents.md`, the current
   `packages/curriculum/data/the-basics.json`, and one shipped sheet
   (day-02 is a good exemplar). For a range, plan the whole arc before
   writing any single sheet: one theme per day, each day teachable back
   in one sentence.
2. State each day's scope in one sentence. Gate on Step Back A below.
3. Write `docs/curriculum/day-0N.md` from
   `${CLAUDE_SKILL_DIR}/templates/lesson-sheet.md` — same voice and
   format as the shipped sheets, runnable COLD by a non-player on a real
   board. Design sheets additionally carry:
   - a **status callout** right under the For/Time line:
     `> **Status: design spec.** The app can't serve this day yet — it
     needs <the seam, plainly named> from the core. Everything below
     runs today on a real board.`
   - a **candidate FEN** in italics under every diagram —
     `*(app position — candidate FEN: \`...\`)*` — so the build phase
     has the exact intended position. Diagrams are drawn FROM these
     FENs (rank 8 on top); they are "candidate" only in that the
     verifier has not proven them yet.
4. For a range: after all sheets exist, emit the **dependency ledger** —
   one line per day: buildable now, or blocked on which seam
   (`rules:"standard"`, opponent, new exercise kind, oracle). Record it
   in the final report to the operator. DO NOT start seam work; those
   are separate, owner-approved tasks.

### Phase B — Build (per day; only when nothing in the ledger blocks it)

5. **Tests before content (F1).** For each piece/mechanic the day
   teaches, add the movement-vs-standard equivalence test in
   `crates/truth-core/src/scenario.rs` (shape of
   `movement_matches_real_rook_geometry`, blocked line + capture; pawns
   need several; intentional divergences get named tests). New mechanics
   get playable P2-shape tests. Read
   `${CLAUDE_SKILL_DIR}/reference/equivalence-tests.md` first.
6. Run `pnpm test:rust` (exit 0), then `pnpm build:wasm`.
7. Author the data in `packages/curriculum/data/the-basics.json` — nodes
   (id, title, objective, prereqs, `status: "active"`, strand, mastery
   `n:2,m:3` default, teaches, 3 practice + 1 assessment exercise ids,
   hints in child voice), exercises per the arc and FEN rules in
   `${CLAUDE_SKILL_DIR}/reference/exercise-authoring.md`, and the
   `days[]` entry. Start from the sheet's candidate FENs. Node array
   order must equal day order (`validateCurriculum` enforces it).
8. Run `pnpm verify:curriculum`; fix FENs/budgets until every exercise
   is valid, solvable, on-target, `minSolutionLength >= 1`. Budgets
   tighten to the proven minimum, never widen. Gate on Step Back B.
9. Pin each budgeted exercise in the difficulty table of
   `packages/verifier/test/verify-curriculum.test.ts`; update the
   active-node list in `packages/curriculum/test/router.test.ts`; run
   `pnpm test`.
10. If the day introduces a mechanic the play surface has never rendered,
    invoke the `build-day-experience` skill — never extend
    `packages/web` from here.
11. **Reconcile the sheet:** verified FEN differs from the candidate ⇒
    redraw the diagram from the verified FEN; then remove the status
    callout and the candidate-FEN lines (the day is authored — diagrams
    now mirror `the-basics.json`, the single source).
12. Update the curriculum-status section of `README.md`; run the full
    gate set and the Verification Checklist.

## Step Back A: before writing any sheet

> "Would van Wijgerden ship this day?"

- ONE concept a 7-year-old can hold. Needs two sentences ⇒ two days.
- Prereq concepts all live in earlier days (sheet-level: concepts, not
  node status — a design sheet may depend on an earlier design sheet).
- Name honestly what the day needs from the app: nothing new / a new
  goal type / `rules: "standard"` / an opponent / a new exercise kind.
  That single line decides Phase B eligibility and goes in the ledger.
  **If a needed seam is closed, the sheet still gets written — and this
  skill's work on that day ENDS there.** Implementing seams from inside
  a day-authoring dispatch is the failure mode this rule exists for.

## Step Back B: before verifying (unchanged discipline)

> "Is the puzzle honest?"

- Could a learner already be done at the start position?
- Does the budget teach efficiency, or punish exploration? Budget the
  efficiency round and checkpoints; leave a node's first gobble
  unbudgeted for joy.
- Every decoy reachable; every position chess-natural (no pawns on
  ranks 1/8; kings only as scenery under movement rules).

## Verification Checklist

Phase A (per sheet):
- [ ] `ls docs/curriculum/day-0<N>.md` succeeds; format matches the
      shipped sheets (rule of the day, parts, coaching, legend,
      stop-while-fun).
- [ ] Design sheets: status callout present and the needed seam named;
      every diagram has a candidate FEN; every diagram drawn from its
      FEN with rank 8 on top.
- [ ] Range: the dependency ledger reported to the operator.

Phase B (per built day) — all of:
- [ ] `pnpm test:rust` exits 0; new equivalence/P2 tests exist
      (`grep -n "movement_matches_real_<piece>" crates/truth-core/src/scenario.rs`).
- [ ] `pnpm verify:curriculum` exits 0 with every new exercise passing.
- [ ] `grep -n '"day": <N>' packages/curriculum/data/the-basics.json`
      finds the day; new node ids appear in `nodes` and the day list;
      every node carries a strand.
- [ ] Difficulty table updated; `pnpm test` and `pnpm typecheck` exit 0.
- [ ] Sheet reconciled: no status callout, no candidate-FEN lines,
      diagrams mirror the authored FENs.
- [ ] `grep -n "<new-node-id>" README.md` finds the status update.
- [ ] If step 10 fired: `build-day-experience` invoked.

## Constraints

- NEVER implement a core seam (rules model, opponent, goal type,
  exercise kind, oracle) from this skill. Name it, ledger it, stop.
- NEVER author data for a piece/mechanic before its test exists (F1).
- NEVER hardcode lesson copy in TS — prompts, hints, wrap-ups, teasers
  are data.
- NEVER weaken `verify:curriculum`, `assertServable`, or the tightness
  test to make content pass — fix the content.
- ALWAYS write scenario FENs with counters `0 1`.
- ALWAYS run `pnpm build:wasm` after touching `crates/`.
- ALWAYS keep a design sheet playable on a physical board even while the
  app cannot serve it.

## Files in this skill

| File | Purpose |
|---|---|
| `reference/equivalence-tests.md` | How to build the F1 test for each piece: parked-kings rules, divergence tests, pawn coverage |
| `reference/exercise-authoring.md` | Exercise arc, FEN rules, budgets, hints, prompt-affordance rules (playtest-derived) |
| `reference/anti-patterns.md` | Authoring mistakes that verification catches late or never |
| `templates/lesson-sheet.md` | Scaffold for `docs/curriculum/day-0N.md` |
