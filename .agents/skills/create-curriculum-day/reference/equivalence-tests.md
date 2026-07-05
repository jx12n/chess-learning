# Equivalence tests (F1 discipline)

The core has two rules models: `engine.rs` (standard, shakmaty movegen)
and `scenario.rs` (movement model, shakmaty attack tables). They drift
apart *per piece* unless each piece is proven equivalent. The proof
lives in `crates/truth-core/src/scenario.rs` tests, using the existing
helpers `mini_ucis(scenario_json)` and `standard_ucis(fen, piece)`.

## Shape

One test per piece: build a mini position (kingless is fine) with
(a) a line blocked by an OWN piece and (b) a capture of an ENEMY piece,
then compare the full UCI set against `filter_legal_moves` on an
equivalent standard position with kings parked. `assert_eq!(mini, reference)`.

## Parking kings (the part that goes wrong)

Standard positions must contain both kings; the mini has none. Park them
where they cannot perturb the comparison:

- OFF every line (rank/file/diagonal) through the piece under test —
  a parked king on a ray blocks it and the sets diverge.
- Not adjacent to each other; neither side in check.
- For the KING equivalence test: any adjacent enemy piece must attack
  NO square of the king's ring, or standard check-filtering removes
  moves the mini keeps (a black pawn diagonally behind works: it
  attacks only two squares, both outside the ring).

## Intentional divergences get their own tests

Never let a divergence hide inside a skipped comparison. Existing named
tests to follow as exemplars:

- `king_movement_model_omits_check_semantics_by_design` — mini allows
  stepping onto an attacked square; standard forbids it.
- `pawn_promotion_auto_queens_by_design` — mini offers exactly `e7e8q`;
  standard offers four.
- `en_passant_is_absent_by_design` — parse strips the ep square.

## Pawns need several tests

- Pushes: free (single + double), double-blocked (piece two ahead),
  fully blocked (piece one ahead ⇒ zero moves — also proves no forward
  capture).
- Captures: enemies on both diagonals + blocker ahead ⇒ captures only.
- BLACK direction: repeat one comparison with `b` to move — direction
  asymmetry is pawn-specific risk.

## New mechanics get playable tests (P2 shape)

A mechanic the band has never used (promotion goal, budget-forced value
pick, multi-piece goal) gets a scenario-level test that plays a real
UCI sequence to `goal-met` — see `promotion_race_is_playable`,
`value_pick_rewards_the_bigger_prize`, `whole_army_gobble_is_playable`.
