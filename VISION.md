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

## The shape of the journey — a spiral, not a ladder

The Basics' seven days are the first lap, not the product. The
curriculum is a **spiral**: a handful of strands — board vision, piece
play, value, teamwork, king safety, and later tactics, endgames, whole
games — that each come back around at greater depth, year after year.
In the data this stays a DAG: strands recur, nodes never do. Every node
carries a `strand` tag, and a band is one lap across the strands at one
depth.

Two consequences we build toward deliberately:

- **Branch points, not a single file line.** The DAG already holds many
  nodes open at once (master the board and five pieces unlock). The
  router exposes that whole *frontier*; serving order is a policy on
  top — the Basics walks it linearly, later bands can offer the
  frontier as a menu, and the agent layer picks from the same set.
- **Forever-modes, not a finish line.** Some points on the spiral open
  activities that never close: daily tactics volume (Gobet's pattern
  engine), endgame technique, whole games against a human-like
  opponent, reviewing your own games. "Graduating" a strand means
  unlocking one of these engines, not ending it. And mastered skills
  are resurfaced as they fade — the retention model's job (the BKT
  seam), which is why practice attempts are timestamped now, years
  before the model that reads them.

- **The learner's ceiling, not the product's.** Stop after the Basics —
  that's a complete, satisfying arc on its own. Keep climbing toward
  1500, 2000, 2800 — the spiral keeps deepening (sharper tactics
  volume, real endgame technique, tougher human-like opposition, finer
  feedback) for as long as the learner wants to go. How far this goes
  is the learner's decision, never a cap the product designs in.

A band completing is a celebration and a doorway, never an ending.

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
- Years in, there is always a worthwhile next thing — and an old skill
  comes back to visit right before it would fade.
