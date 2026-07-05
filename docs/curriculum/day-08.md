# Chess — Day 8: Danger! (Safe or Sorry)

**For:** a 7-year-old beginner · **Time:** ~20 min, in short bursts · **You need:** a real board + pieces (or just this sheet)

> **Status: design spec — core ready.** The danger-spotting mechanic
> shipped as `find-square` over a position (decision D6): the FEN is
> authored enemy-to-move and the verifier proves the answer square
> against core-generated captures — never trusted from data. The escape
> puzzles in Part 3 were already expressible. This day now waits only on
> its authored data. Everything below runs today on a real board.

**Today's rule of the day:** *Before you do ANYTHING, ask: "Is anybody in danger?"* No new moves today — today we learn to SEE. This is the question they will ask before every move for the rest of their chess life.

**Goal for today:** by the end, your child can (1) point at the piece that's in danger and say why, and (2) move a piece in danger to a safe square.

---

## Part 1 — What "in danger" means (4 min)

Set up: enemy rook on d8, your knight on d4, your pawn on g2. Ask first: **"If it were the rook's turn, what could it eat?"** Let them trace the rook's plus-sign with a finger.

```
  +---+---+---+---+---+---+---+---+
8 |   |   |   | r |   |   |   |   |
  +---+---+---+---+---+---+---+---+
7 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
6 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
5 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
4 |   |   |   | N |   |   |   |   |
  +---+---+---+---+---+---+---+---+
3 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
2 |   |   |   |   |   |   | P |   |
  +---+---+---+---+---+---+---+---+
1 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
   a   b   c   d   e   f   g   h
```

*(app position — candidate FEN: `3r4/8/8/8/3N4/8/6P1/8 b - - 0 1`)*

The knight is standing on the rook's road — **the knight is in danger**. The pawn is not on any of the rook's roads — the pawn is safe. Say it like this: **"In danger means: an enemy could eat it on their very next turn."**

---

## Part 2 — Even the queen can be in danger (4 min)

The one kids miss: being BIG doesn't make you safe. Enemy knight on f6, your queen on g4, your rook on b1. Ask: **"Who's in danger here?"** (Trace the knight's L-hops.)

```
  +---+---+---+---+---+---+---+---+
8 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
7 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
6 |   |   |   |   |   | n |   |   |
  +---+---+---+---+---+---+---+---+
5 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
4 |   |   |   |   |   |   | Q |   |
  +---+---+---+---+---+---+---+---+
3 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
2 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
1 |   | R |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
   a   b   c   d   e   f   g   h
```

*(app position — candidate FEN: `8/8/5n2/8/6Q1/8/8/1R6 b - - 0 1`)*

**The queen!** (f6 to g4 is a perfect L.) A 9-point superstar, in danger from a 3-point jumper. **Ask them:** "Does being worth more protect you?" (No — danger doesn't care about points.) "Is the rook in danger?" (No — b1 isn't one of the knight's landing squares.)

---

## Part 3 — Mini-game: "Get Out of There!" (7 min) 🏃

Now the rescue. Your knight on b1 — and TWO enemy towers watching their roads. Find the one safe hop and land on the star.

```
  +---+---+---+---+---+---+---+---+
8 | r |   | r |   |   |   |   |   |
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
2 |   |   |   | ★ |   |   |   |   |
  +---+---+---+---+---+---+---+---+
1 |   | N |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
   a   b   c   d   e   f   g   h
```

*(app position — candidate FEN: `r1r5/8/8/8/8/8/8/1N6 w - - 0 1` · knight to d2 in 1)*

The knight has three hops: a3, c3, d2. Ask before they touch: **"Which roads do the towers watch?"** (The a-road and the c-road.) Two of the three hops land right in traffic — only **d2** is safe.

Round two, the queen's web — almost every escape square is covered. Your bishop on c1, enemy queen on e3:

```
  +---+---+---+---+---+---+---+---+
8 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
7 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
6 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
5 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
4 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
3 |   |   |   |   | q |   |   |   |
  +---+---+---+---+---+---+---+---+
2 |   | ★ |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
1 |   |   | B |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
   a   b   c   d   e   f   g   h
```

*(app position — candidate FEN: `8/8/8/8/8/4q3/8/2B5 w - - 0 1` · bishop to b2 in 1)*

She's staring straight at your bishop (e3–d2–c1). Her web covers a3, d2, f4, g5, h6... **b2 is the one hiding hole.** On the real board: if they pick a covered square, don't say "wrong" — **play the queen's move and gobble the bishop.** The board teaches; you just make the sad munching noise.

**Coaching, gently:** the magic question is always *"which squares does the enemy watch?"* — never "that square is bad."

---

## Wrap-up (2 min)

Teach-back: "What does 'in danger' mean?" (An enemy could eat it on their very next turn.) "What do you ask before every move?" (*Is anybody in danger?*) That question is the whole day — and tomorrow it gets pointed at the most important piece of all.

**Legend:** `N`/`Q`/`R`/`B`/`P` = your pieces · `r`/`n`/`q` = enemy pieces · `★` = the safe square to land on

**Stop while it's still fun.** Next time: someone attacks the KING — and the king can never, ever be gobbled. That emergency has a name: **check**.
