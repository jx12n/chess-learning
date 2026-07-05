# Play-surface rules

## The one law

The UI renders FEN placement and maps clicks. Highlighting, legality,
application, goal detection, transforms — every one is a call into the
WASM core (`scenarioLegalMoves` / `scenarioApply` / `scenarioResult`).
If a TS expression would answer a chess question, it is in the wrong
language.

Presentation MAY read what the core said: `chosen.capture` for the
gobble message, `san.includes('=')` for the promotion celebration —
that narrates a core-reported fact, it does not decide one.

## Where copy lives

| Copy | Home |
|---|---|
| Exercise prompt | exercise `prompt` (data) |
| Piece-specific nudges | node `hints.select` / `hints.illegal` (data) |
| Day celebration + teaser | `days[].wrapUp` / `days[].teaser` (data) |
| Band completion | curriculum `complete` (data) |
| Generic fallbacks, UI chrome ("Restart puzzle", "Moves left") | `main.ts` constants |

New piece-flavored copy in `main.ts` is a bug even when it reads well.

## Day chrome data flow

`showNext` → `dayForNode` → badge + `renderProgress(dayNodes(day))`.
Crossing into a higher day mid-session (`lastDayShown`) renders the
interstitial; a fresh page load resumes directly (no interstitial by
design — celebrate transitions, don't replay them). `nextStep` done ⇒
band-complete screen. Routing itself NEVER consults days.

## Serve gate

`verifyOnce` → `assertServable` before anything reaches the board; the
verify cache pins rejections for the session by design. Never add a
render path that skips it.

## e2e seeding & the dev panel

Specs seed localStorage with `model.serialize(stateWhere(curriculum,
model, { nodeId }))` (import `@chess/curriculum` directly — the JSON
import attribute keeps it plain-Node loadable). Synthesis goes through
the model's own API, so seeds can never drift from the wire format.

The in-app equivalent is the dev panel (`?dev=1`, `src/devpanel.ts`):
jump/sandbox/solve on an isolated `…/dev` profile. It is front-door
only — jumps are `stateWhere` states, sandbox runs the normal players
behind `assertServable` — and it must stay DOM-absent when the flag is
off (`dev-mode.spec.ts` enforces both).

## Board glyph convention

Filled Unicode glyphs (♜♝♛…) for BOTH colors; CSS `.white-piece`
paints White. e2e asserts filled glyphs + the class, never ♖♗♕.
