# Chess — Day 11: The Secret Moves

**For:** a 7-year-old beginner · **Time:** ~15 min, in short bursts · **You need:** a real board + pieces (or just this sheet)

> **Status: design spec — core ready.** Castling under
> `rules: "standard"` scenarios shipped — the wire reports the king's
> landing square (g1/c1), so the click and the reach-square goal agree.
> This day now waits only on its authored data. Everything below runs
> today on a real board.

**Today's rule of the day:** *Castling is the only move in chess where two of your pieces move at once — the king teleports to safety and a rook jumps the wall.* One light day, one glorious trick. (En passant, the pawn's secret, is today just a story.)

**Goal for today:** by the end, your child can (1) castle both directions with the right two-square king slide, and (2) say the three "castle laws" that can lock the door.

---

## Part 1 — The king's teleport (5 min) 🏰

The king is slow — one careful step, remember? Except ONCE per game. Set up just the king and rook (and the enemy king far away):

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
1 |   |   |   |   | K |   |   | R |
  +---+---+---+---+---+---+---+---+
   a   b   c   d   e   f   g   h
```

*(app position — candidate FEN: `4k3/8/8/8/8/8/8/4K2R w K - 0 1` · castle kingside: king e1→g1, rook h1→f1)*

Do it slowly, twice: **the king slides TWO squares toward the rook... and the rook hops over him and lands snug beside him.** King g1, rook f1. Two pieces, one move, totally legal. Kids gasp at this one — let it land.

Now the long way, with the far rook — the king still slides exactly two (e1→c1), the rook still hops over (a1→d1):

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

*(app position — candidate FEN: `4k3/8/8/8/8/8/8/R3K3 w Q - 0 1` · castle queenside: king e1→c1, rook a1→d1)*

The chant: **"King slides two, rook hops over."**

---

## Part 2 — The three castle laws (5 min) ⚖️

The teleport is powerful, so it has laws. The door is locked if:

1. **Someone already moved.** King moved? No castling, ever again. That rook moved? Not with that rook. (Even if they move BACK — the magic knows.)
2. **The road isn't empty.** Every square between king and rook must be clear.
3. **Fire on the road.** The king can't castle *out of* check, *through* an attacked square, or *into* one. No teleporting through fire.

Law 3 in action — the enemy rook watches f1, right on the king's path:

```
  +---+---+---+---+---+---+---+---+
8 |   |   |   |   | k |   |   |   |
  +---+---+---+---+---+---+---+---+
7 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
6 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
5 |   |   |   |   |   | r |   |   |
  +---+---+---+---+---+---+---+---+
4 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
3 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
2 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
1 |   |   |   |   | K |   |   | R |
  +---+---+---+---+---+---+---+---+
   a   b   c   d   e   f   g   h
```

*(app position — candidate FEN: `4k3/8/8/5r2/8/8/8/4K2R w K - 0 1` · castling is illegal — f1 is watched)*

**Ask them:** "The king slides e1... f1... — wait. Who's watching f1?" (The rook — fire on the road, door locked.) "What if the enemy rook stood on a5 instead?" (Not watching the path — castle away!)

---

## Part 3 — The pawn's secret (3 min) 🤫

No exercise today, just the legend, told like a campfire story: pawns have a stealth capture called **en passant** — "in passing." When an enemy pawn tries to sprint two squares right PAST yours, your pawn may snatch it *as if it had only stepped one* — but only on the very next turn, or the chance vanishes forever. It's rare, it's sneaky, and one day in a real game it will happen to you. When it does: come find me, and we'll do it together. (That's the whole lesson. Planting the flag is enough.)

**Coaching, gently:** from today on, in every practice game, ask ONE question in the early moves: *"Is your king still standing in the middle?"* Castling early is the first grown-up habit — day 13 depends on it.

---

## Wrap-up (2 min)

Teach-back: "How does castling go?" (King slides two, rook hops over.) "The three laws?" (Nobody moved, empty road, no fire on the road.) "When do we castle?" (Early!)

**Legend:** `K`/`R` = your pieces · `k`/`r` = enemy pieces

**Stop while it's still fun.** Next time: a visitor arrives. Small, green, and VERY hungry — he takes anything you leave unguarded. Time to make the danger-question a reflex.
