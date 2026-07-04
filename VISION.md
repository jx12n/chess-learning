# Vision — a generative teaching framework, chess first

## What this becomes

A tutor that teaches a real seven-year-old chess the way the best human
coach would — Steps-Method sequencing, pattern volume through play,
human-like opposition, mistake-targeted feedback — where a generative
agent decides *what to say* and a deterministic core guarantees that
every chess claim underneath it is *true*.

Chess is the first domain, not the last. The pedagogy machinery — skill
DAG, learner model, tutoring loops, generate-then-verify gate — is
deliberately domain-blind so a second domain can plug in behind the same
seams.

## The core bet

The LLM is never the source of truth about chess. The system is two
epistemically different halves:

- **Deterministic core** — legality, application, results, solvability,
  evaluation. Fast, verifiable, boring, correct.
- **Generative pedagogy** — what to teach, how to say it, when to push.
  Fuzzy and adaptive, but only ever allowed to make chess claims the
  core has verified.

Everything generative is **generate-then-verify**: proposed content is
proven valid, solvable, and on-target before a learner sees it, and
refused otherwise. This is the one commitment that keeps a generative
teacher from being confidently wrong to a child.

## Who would build this best — the lenses we work under

No single person spans this project; the honest roster is a team, and
which lens *leads* depends on the seam being touched.

| Seam | Lens | Their standard, applied here |
|---|---|---|
| Curriculum — what to teach next | **Cor van Wijgerden** (Steps Method) | Board vision before checkmate. A block is mastered before the next is introduced. A non-player can run the lesson from the script. |
| Skill acquisition | **Fernand Gobet** (chunking research) | Skill is thousands of recognized patterns; volume at the right difficulty beats explanation. Also the house skeptic: no cognitive-transfer claims — chess for chess's sake. |
| Truth core | **Niklas Fiekas** (shakmaty, python-chess) | Never hand-roll chess. Every rules model proven equivalent per piece. Boring correctness over cleverness. |
| Learner model & tutoring loops | **VanLehn; Corbett & Anderson** (ITS, BKT) | Mastery is estimated, never assumed. Outer loop picks the node; inner loop answers the move. |
| Opponent | **Reid McIlroy-Young** (Maia) | An opponent that errs like a 900-rated human teaches; a throttled engine doesn't. |
| Teaching agent | **Ashton Anderson & Jon Kleinberg** (Maia lab) | Instruction targeted at the learner's actual mistakes, grounded in verified truth — the agent is a client of the core, never its replacement. |

Two users hold standing veto and appear on no masthead:

- **The child** — one concept per lesson, short bursts, praise the
  thinking, stop while it's still fun.
- **The parent-coach** — likely not a chess player; every lesson must be
  runnable cold from its script, Steps-manual style.

**Current phase:** authoring the Basics — van Wijgerden and Gobet lead
content decisions, Fiekas leads core discipline. Anderson's lens takes
over when the agent layer opens.

## The road

1. **The Basics band** (now) — author the remaining piece nodes under
   the per-piece equivalence-test discipline; pressure-test the scenario
   schema against a pin and a fork before more consumers exist.
2. **Tactics & oracles** — Stockfish behind the stubbed `evaluate()`;
   solvability search moves into the core when the TS BFS stops scaling.
3. **Opposition** — a Maia-style human-like opponent behind
   `opponent: "engine"` in the Scenario schema.
4. **The agent layer** — an LLM tutor as a *client* of the tool API:
   plans from the learner model, narrates lessons, proposes exercises —
   all gated by the verifier.
5. **A second domain** — router, learner model, and loops already import
   nothing chess-specific; prove it by hosting one.

## Non-goals

- The LLM adjudicating any chess fact, ever.
- Opening theory anywhere near the Basics.
- "Chess makes kids smarter" claims — the transfer evidence is weak
  (Sala & Gobet); we teach chess for chess.
- Engagement mechanics that fight "stop while it's still fun."

## What success looks like

- A seven-year-old finishes a lesson and asks for one more.
- Every exercise ever served was proven solvable before render — zero
  exceptions since Day 1.
- The agent layer lands as a new client of existing seams, not a
  rewrite.
