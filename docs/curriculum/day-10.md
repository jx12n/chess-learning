# Chess — Day 10: Checkmate & the Sneaky Tie

**For:** a 7-year-old beginner · **Time:** ~20 min, in short bursts · **You need:** a real board + pieces (or just this sheet)

> **Status: design spec — core ready for the mate puzzles.** The
> *checkmate* goal under full rules shipped (D2), so every mate-in-1 is
> fully expressible. The mate-or-not quiz gets its shape when the day is
> authored — reframed as a click-the-answer position (D6) or a small
> surface addition via build-day-experience. Everything below runs today
> on a real board.

**Today's rule of the day:** *Checkmate = check + all three doors locked. That's the win.* And its sneaky cousin: no check but no moves at all = **stalemate**, a tie — the trap that steals wins from every beginner on Earth.

**Goal for today:** by the end, your child can (1) look at a position and say "checkmate," "just check," or "stalemate — tie!", and (2) deliver a checkmate in one move with a queen and with a rook.

---

## Part 1 — Three doors, all locked (4 min) 🔒

Yesterday's detective questions, one more time: run? block? capture? When the answer is no, no, and no — **and the king is in check — the game is over. Checkmate.** The king is never gobbled; he's trapped, and trapped is enough.

Quiz position one — enemy king in his castle corner, your rook lands on the back row:

```
  +---+---+---+---+---+---+---+---+
8 | R |   |   |   |   |   | k |   |
  +---+---+---+---+---+---+---+---+
7 |   |   |   |   |   | p | p | p |
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
1 |   |   |   |   |   |   | K |   |
  +---+---+---+---+---+---+---+---+
   a   b   c   d   e   f   g   h
```

*(app position — candidate FEN: `R5k1/5ppp/8/8/8/8/8/6K1 b - - 0 1` · checkmate — his own pawns lock the doors)*

**Ask them, doors in order:** run? (His own pawns fill every upstairs square — f8 and h8 are still on the rook's road.) Block? (Nothing to block with.) Capture? (Nothing reaches a8.) **Checkmate!** The famous name: the *back-rank mate*.

Now slide the g7 pawn off the board and ask again. (Kg7 — the king slips out the gap. Just check!) One pawn changed the whole answer — that's why we always check the doors, never guess.

---

## Part 2 — Mate in one: your first winning move (6 min) 👑

The queen's mating hug. Enemy king in the corner, your king standing guard nearby, your queen ready on c1. **One queen move wins the game. One other queen move looks almost the same... and ties it.** Find the win:

```
  +---+---+---+---+---+---+---+---+
8 | k |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
7 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
6 |   | K |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
5 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
4 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
3 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
2 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
1 |   |   | Q |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
   a   b   c   d   e   f   g   h
```

*(app position — candidate FEN: `k7/8/1K6/8/8/8/8/2Q5 w - - 0 1` · Qc8 is mate; Qc7 is the trap)*

**Queen to c8: CHECKMATE.** (Check along the top row; a7 and b7 are guarded by your king; b8 by the queen. All doors locked.)

And the rook can do it too — his king walks the enemy king to the edge, the rook lands the hammer:

```
  +---+---+---+---+---+---+---+---+
8 |   |   |   |   |   |   |   | k |
  +---+---+---+---+---+---+---+---+
7 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
6 |   |   |   |   |   |   | K |   |
  +---+---+---+---+---+---+---+---+
5 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
4 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
3 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
2 |   |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
1 | R |   |   |   |   |   |   |   |
  +---+---+---+---+---+---+---+---+
   a   b   c   d   e   f   g   h
```

*(app position — candidate FEN: `7k/8/6K1/8/8/8/8/R7 w - - 0 1` · Ra8 is mate — your king guards every side door)*

Notice the pattern in BOTH: **the queen or rook gives the check; YOUR KING locks the doors.** Two pieces, one teamwork mate — Day 7's lesson wearing a crown.

---

## Part 3 — The sneaky tie (6 min) 🤝

Back to the queen position. Play **queen to c7** instead. Look carefully: the enemy king is NOT in check... and count his moves. (a7? Guarded. b7? Guarded. b8? Guarded.) **No check, no moves at all — STALEMATE. The game is a TIE.** You had a whole queen extra, and the treasure chest snapped shut on your fingers.

Say it like this: **"If he's frozen but NOT in check — it's a tie. Always leave the king one bad square to run to, until you're ready to lock every door WITH check."**

On the real board, replay both queen moves side by side — c8 (win!) and c7 (tie!) — until they can call each one before the piece lands. Then the quiz game: set up the three positions from today in any order and ask, *"checkmate, just check, or sneaky tie?"*

**Coaching, gently:** when they stalemate you — and they will, everyone does — celebrate the catch, don't mourn the win: *"You froze me! Now... how could you have frozen me WITH check?"*

---

## Wrap-up (2 min)

Teach-back: "What's checkmate?" (Check, plus all three doors locked — the win.) "What's stalemate?" (Frozen but NOT in check — a tie.) "Who locks the doors in our mates?" (My king!)

**Legend:** `K`/`Q`/`R` = your pieces · `k`/`p` = enemy pieces

**Stop while it's still fun.** Next time: the two secret moves grown-ups never mention — the king's one-time **castle teleport**, and the pawn's sneakiest trick.
