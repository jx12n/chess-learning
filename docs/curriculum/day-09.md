# Chess — Day 9: Check! (The Three Doors)

**For:** a 7-year-old beginner · **Time:** ~20 min, in short bursts · **You need:** a real board + pieces (or just this sheet)

> **Status: design spec — core ready.** Full-rules scenarios
> (`rules: "standard"`) with the *give-check* and *escape-check* goals
> shipped (decisions D1–D2). This day now waits only on its authored
> data. Everything below runs today on a real board.

**Today's rule of the day:** *When the king is attacked, it's called CHECK — and saving him comes before everything else in the world.* The king can never be gobbled; that's why check is an emergency with its own name.

**Goal for today:** by the end, your child can (1) give a check on purpose and say "check!" out loud, and (2) find all three ways out of check: run, block, or capture.

---

## Part 1 — Shouting CHECK (5 min) 📣

Yesterday's question was "is anybody in danger?" Today: **what if it's the KING?** Set up: your rook on a1, your king on e1, enemy king on e8. Ask first: **"Where can the rook go so it's attacking the enemy king?"**

```
  +---+---+---+---+---+---+---+---+
8 |   |   |   |   | k |   |   |   |
  +---+---+---+---+---+---+---+---+
7 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
6 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
5 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
4 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
3 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
2 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
1 | R |   |   |   | K |   |   |   |
  +---+---+---+---+---+---+---+---+
   a   b   c   d   e   f   g   h
```

*(app position — candidate FEN: `4k3/8/8/8/8/8/8/R3K3 w - - 0 1` · rook to a8 gives check)*

Slide the rook up to **a8** — now it stares straight down row 8 at the king. Say it together, loud and delighted: **"CHECK!"** That's the whole move: attack the king, announce it. (Only a8 works here — let them hunt for it.)

**The big rule:** you may never LEAVE your own king in check, and you may never move him INTO one. The referee (the app, or you) simply won't allow it.

---

## Part 2 — The three doors out (8 min) 🚪🚪🚪

When YOUR king is in check, there are exactly three doors. Not four. Not two. Three — and sometimes only one is open.

**Door 1 — RUN.** Enemy rook shouts check down the e-road. The king steps off it. (Four squares work: d1, d2, f1, f2 — but NOT e2, still on the road!)

```
  +---+---+---+---+---+---+---+---+
8 |   |   |   |   | r |   |   | k |
  +---+---+---+---+---+---+---+---+
7 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
6 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
5 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
4 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
3 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
2 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
1 |   |   |   |   | K |   |   |   |
  +---+---+---+---+---+---+---+---+
   a   b   c   d   e   f   g   h
```

*(app position — candidate FEN: `4r2k/8/8/8/8/8/8/4K3 w - - 0 1` · any king step off the e-file escapes)*

**Door 2 — BLOCK.** Your king is tucked in the corner behind his pawns — he can't run. But your rook can jump in front of the attack like a shield. **Only one move in the whole position works: rook to f1.**

```
  +---+---+---+---+---+---+---+---+
8 | k |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
7 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
6 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
5 |   |   |   |   |   | R |   |   |
  +---+---+---+---+---+---+---+---+
4 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
3 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
2 |   |   |   |   |   |   | P | P |
  +---+---+---+---+---+---+---+---+
1 |   |   |   |   | r |   |   | K |
  +---+---+---+---+---+---+---+---+
   a   b   c   d   e   f   g   h
```

*(app position — candidate FEN: `k7/8/8/5R2/8/8/6PP/4r2K w - - 0 1` · rook to f1 is the only legal move)*

**Ask them:** "Can the king run?" (No — g1 is still on the attack road, and his own pawns fill h2 and g2.) "Can anything eat the checker?" (No — too far.) "So...?" (Shield! Rf1!)

**Door 3 — CAPTURE.** A naughty knight hops in and checks the king — and knights can't be blocked (the attack jumps OVER shields). The king can't run (every square is watched). But look: **your little g2 pawn can just EAT him.**

```
  +---+---+---+---+---+---+---+---+
8 | k |   |   |   |   |   |   | r |
  +---+---+---+---+---+---+---+---+
7 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
6 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
5 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
4 |   |   | b |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
3 |   |   |   |   |   | n |   |   |
  +---+---+---+---+---+---+---+---+
2 |   |   |   |   |   | P | P |   |
  +---+---+---+---+---+---+---+---+
1 |   |   |   |   |   |   | K |   |
  +---+---+---+---+---+---+---+---+
   a   b   c   d   e   f   g   h
```

*(app position — candidate FEN: `k6r/8/8/8/2b5/5n2/5PP1/6K1 w - - 0 1` · pawn takes on f3 is the only legal move)*

The chant, counting on three fingers: **"Run. Block. Capture. Check every door."**

---

## Part 3 — Mini-game: "Door Detective" (5 min) 🔍

On the real board, replay each Part-2 position and ask the detective questions in order, every time: *"Can he RUN? Can we BLOCK? Can we EAT it?"* Then swap: **let them give YOU checks**, and you escape badly on purpose — walk into another check and let them catch the illegal move. Being the referee is the fastest way to learn the rule.

**Coaching, gently:** if they freeze in check, never point at the answer. Just walk the three doors out loud, in order. The ritual IS the skill.

---

## Wrap-up (2 min)

Teach-back: "What's check?" (The king is attacked!) "What are the three doors?" (Run, block, capture.) "Can the king ever be gobbled?" (Never — that's why check is an emergency.)

**Legend:** `K`/`R`/`P` = your pieces · `k`/`r`/`n`/`b` = enemy pieces

**Stop while it's still fun.** Next time, the biggest moment yet: what happens when the king is in check and **ALL THREE DOORS ARE LOCKED**. That's how chess games are won — and it has the most famous name in the game.
