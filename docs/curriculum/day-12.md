# Chess — Day 12: Don't Feed Pip! (Meet Your First Opponent)

**For:** a 7-year-old beginner · **Time:** ~20 min, in short bursts · **You need:** a real board + pieces (or just this sheet)

> **Status: design spec — core ready.** The deterministic *greedy*
> opponent (Pip) and the *survive* goal shipped (D3), and the play
> surface renders his replies. This day now waits only on its authored
> data. Everything below runs today on a real board, with YOU
> playing Pip.

**Today's rule of the day:** *Anything you leave where an enemy can take it for free — Pip WILL take it. Every time. No mercy.* Until now the enemy pieces stood still. Today, for the first time, they move back.

**Goal for today:** by the end, your child can (1) make several moves in a row without leaving a piece unguarded, and (2) tell a free bite from a poisoned one before grabbing.

---

## Part 1 — Meet Pip (2 min) 👺

Pip is a small green goblin with exactly one thought in his head: **"Is there a free snack?"** He always grabs the biggest unguarded piece on the board. He never plans, never bluffs, never forgives. He is, honestly, a very simple goblin — and beating him only takes one habit: **Day 8's question, every single move.** *Is anybody in danger?*

**Playing Pip on the real board is easy — say his law out loud and obey it:** "I take the biggest free thing. If nothing's free, I just shuffle." Ham it up. Munching noises are mandatory.

---

## Part 2 — Mini-game: "Dodge the Tower" (8 min) 🏃‍♀️

Your knight against Pip's rook. Your mission: **survive two whole turns.** After every knight hop, Pip gets a move. Leave the knight on a watched square even ONCE and — munch.

```
  +---+---+---+---+---+---+---+---+
8 | r |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
7 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
6 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
5 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
4 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
3 |   |   | N |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
2 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
1 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
   a   b   c   d   e   f   g   h
```

*(app position — candidate FEN: `r7/8/8/8/8/2N5/8/8 w - - 0 1` · survive 2 knight moves vs the greedy rook)*

The ritual before EVERY hop, out loud: **"Which roads does the tower watch... is my landing square safe?"** (From c3: hops to a2 and a4 land on his road — everything else is safe. After the rook moves, the roads MOVE with it. Look again every turn.)

When the knight gets munched — and it will, that's the point — laugh, reset, go again. Pip teaching the lesson is a hundred times better than you teaching it.

---

## Part 3 — Free bite or poisoned bite? (7 min) 🍬☠️

Day 7 taught "grab the biggest prize." Pip adds the grown-up half: **first check who bites back.** Your rook sees two snacks — a pawn straight ahead, a knight along the bottom row. Only one is free:

```
  +---+---+---+---+---+---+---+---+
8 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
7 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
6 |   |   |   |   | p |   |   |   |
  +---+---+---+---+---+---+---+---+
5 |   |   |   | p |   |   |   |   |
  +---+---+---+---+---+---+---+---+
4 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
3 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
2 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
1 |   |   |   | R |   |   | n |   |
  +---+---+---+---+---+---+---+---+
   a   b   c   d   e   f   g   h
```

*(app position — candidate FEN: `8/8/4p3/3p4/8/8/8/3R2n1 w - - 0 1` · take the knight; the pawn has a bodyguard)*

**Ask them, before they touch:** "Who guards the pawn on d5?" (The other pawn, on e6 — pawns bite diagonally, remember?) "Who guards the knight on g1?" (Nobody!) Grab the pawn and Pip answers *munch* — your 5-point rook for a 1-point pawn. Grab the knight and it's free candy.

The chant: **"Before you bite — who bites back?"**

---

## Wrap-up (3 min)

Teach-back: "What does Pip always do?" (Takes the biggest FREE thing.) "How do we starve him?" (Never leave anyone unguarded — ask the danger question every move.) "Before we grab?" (Who bites back!)

**Legend:** `N`/`R` = your pieces · `r`/`p`/`n` = Pip's pieces · Pip = plays the biggest free capture, every time

**Stop while it's still fun.** Next time is the big one. The whole board. All the pieces. All the rules. **Your first real game of chess — against Pip.** Sleep well, goblin-tamer.
