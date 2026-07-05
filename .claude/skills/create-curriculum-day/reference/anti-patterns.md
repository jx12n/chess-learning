# Anti-patterns

## Author content first, test later
The F1 rule exists because the two movegen paths drift silently. The
equivalence test comes first; content that arrives before its test gets
reverted, not grandfathered.

## Fix a failing exercise by loosening the gate
If `verify:curriculum` refuses an exercise, the exercise is wrong.
Never raise a depth cap, widen a budget past the proven minimum, or
touch `servable()`.

## Impossible decoys
A decoy the piece cannot legally reach teaches nothing and confuses the
verifier's `unique` signal. Every decoy must be one legal move away.

## Pawns on ranks 1/8, floating kings
The movement model tolerates them; a parent-coach with a real board
will not. Positions must be settable on a physical board without
raised eyebrows.

## Prompt promises the wrong number
"in 3 moves" with `movesBudget: 2` is a lie the child discovers alone.
The prompt's number and the budget are the same fact — grep one when
changing the other.

## Splitting one concept across a day boundary
If the capture node needs the movement node's discovery re-explained,
the day was split wrong. A day = one theme a kid can teach back in one
sentence.

## Editing node ids that learners have progressed against
Learner state is keyed by node id in localStorage. Renaming an ACTIVE
node orphans progress. Rename only stubs; otherwise migrate state.

## Diagram drift in lesson sheets
An ASCII board that doesn't match the authored FEN sends the parent and
the app in different directions. Copy the FEN, draw the board from it,
then re-check rank 8 is at the top.
