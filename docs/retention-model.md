# The retention model — seam sketch

The design note for the BKT seam: what the future retention-aware
learner model must do, what is already recorded for it, and what swaps
where. Nothing here is built; this documents the contract so the swap
is a file replacement, not a refactor. See VISION.md, "The shape of the
journey" — resurfacing fading skills is what makes a multi-year spiral
feel alive instead of like a ladder someone already climbed.

## What it must do (that the counter stub doesn't)

1. **Estimate, don't count.** Replace the n-of-m window with a per-node
   mastery posterior (BKT: P(known), learn/slip/guess rates — Corbett &
   Anderson). `mastered()` becomes "posterior above threshold".
2. **Decay.** Mastery estimates fall with elapsed time since the last
   correct attempt on that node (or its strand). A node mastered eight
   months ago is not mastered today.
3. **Resurface.** Expose which *mastered* nodes have decayed enough to
   be worth revisiting — the review queue. The router's `frontier()`
   stays "what's newly reachable"; the review queue is its complement:
   "what's slipping". A serving policy interleaves the two.

## What is already recorded for it

- `AttemptEvent.at` (ms since epoch) — reported by the play surface on
  every attempt since the spiral alignment; the counter stub stores
  *practice* times in `practiceAt` (lockstep with `practice`, `null`
  for attempts from before timestamps existed) and ignores them. Decay
  is unlearnable without this history, and history not captured is
  gone — that is why capture landed years before the model that reads
  it. Accepted loss, on purpose: assessment attempts keep only
  pass/fail (the stub's pre-existing shape). An assessment follows
  mastered practice within the same sitting, so the node's
  last-evidence time is still pinned to within minutes; the v2 state's
  unified attempt log closes the gap properly.
- Per-node attempt outcomes, oldest-first, unbounded (the stub reads
  only the last `m`).
- `AttemptEvent.latencyMs` and `AttemptEvent.hintCount` (band-2
  foundation onward) — response time from puzzle-shown to deciding
  action, and inner-loop nudges consumed. Stored lockstep like
  `practiceAt` (null-padded before capture existed), read by nothing
  yet. Fluency lives in speed — recognition time is the signature of
  chunking — and a clean answer is different evidence from a
  five-nudge answer; both distinctions are this model's to use.
- `SkillNode.strand` — the spiral thread, so decay and resurfacing can
  pool evidence across a strand, not just a single node.

## What swaps, what doesn't

| Piece | Fate |
|---|---|
| `learner.ts` (counter stub) | Replaced wholesale — the seam's design intent. |
| `LearnerModel` interface | Unchanged, plus one addition: a review-queue accessor (e.g. `fading(state, nodes, now): SkillNode[]`). Add it to the interface only when the model that implements it lands. |
| `LearnerState` wire format | New `version: 2` (posteriors + attempt log). `deserialize` migrates v1: seed each node's posterior from its window, keep `practiceAt` as the attempt log. Nobody's saved progress is lost. |
| `router.ts` / play surface | Untouched — they see `LearnerModel` only. A review-aware serving policy is a new policy over `frontier()` + the review queue, beside `nextStep`, not inside it. |

## Non-goals

- No spaced-repetition scheduling UI ("due today: 12") — resurfacing is
  woven into play, in character for a seven-year-old.
- No cross-learner analytics; state stays one local blob per profile.
- No decay tuning theater before there is a year of real attempt
  history to tune against.
