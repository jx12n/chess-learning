# Operator walk checklist

Play the day as the learner (and as the parent looking over their
shoulder) before calling it done. These items came from a real
7-year-old's Day-1 playtest — keep earning them.

Reach the day: open the app with `?dev=1` and jump via the backstage
panel (isolated dev profile, real state synthesis); its sandbox and
"Solve current" make single-exercise checks fast. Walk the kid-facing
items below with the panel collapsed (Ctrl+Shift+D).

## Orientation — "do I know where I am?"

- [ ] Day badge shows the right day; progress chips show ONLY this
      day's nodes, current one marked.
- [ ] "Puzzle X of Y" counter present and truthful for the shortest
      path (the playtest kid asked for exactly this).
- [ ] Coordinate labels legible at arm's length — big, bold, high
      contrast on both square colors.

## Affordances — "did anything appear unexplained?"

- [ ] Every visual the day relies on is explained in prompt or hint the
      first time it appears: star (target), red ring ("you can gobble
      that piece"), dots (where you can go).
- [ ] Selecting a piece that can capture surfaces the red-ring hint.
- [ ] The wrong-click nudge names the piece's rule (from `hints.illegal`)
      — never a bare "no".

## Flow — "does it feel like play?"

- [ ] First puzzle solvable in seconds after reading its prompt cold.
- [ ] Capture feedback lands per gobble; promotion gets its 👑 moment.
- [ ] Failure copy is warm and restartable ("Restart puzzle" works,
      budget-fail suggests looking at the whole board).
- [ ] Day-complete interstitial celebrates, lists the day's skills,
      offers the stop ("stop while it's still fun") AND the next day.
- [ ] Nothing rook-flavored leaks into other pieces' days.

## Parent lens — "could I run this cold?"

- [ ] The day's `docs/curriculum/day-0N.md` matches what the app
      actually serves (same positions, same order of ideas).
- [ ] Prompts' move counts match budgets everywhere you played.
