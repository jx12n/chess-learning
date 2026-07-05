/**
 * P3/P6 gate for the Day 2–7 mechanics that Day 1 never exercised:
 * bishop diagonals with data-driven hints, pawn promotion (the piece
 * transforms on the board), value-pick single-move choices, and
 * multi-piece teamwork — plus the day-boundary celebrations and the
 * band-complete screen.
 *
 * Later days are reached by seeding mastered learner state, so each
 * test drives only its own day through the real play surface.
 */
import { expect, test, type Page } from '@playwright/test';
import {
  counterLearnerModel as model,
  stateWhere,
  theBasics,
} from '@chess/curriculum';

const sq = (page: Page, name: string) => page.locator(`[data-square="${name}"]`);

async function clickSquares(page: Page, squares: string[]): Promise<void> {
  for (const s of squares) {
    await sq(page, s).click();
  }
}

async function next(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Next' }).click();
}

const STORAGE_KEY = 'chess-tutor/learner-state/v1';

/**
 * Seed by synthesizing a REAL learner state with the curriculum's own
 * `stateWhere` (a simulated perfect learner) and serializing it through
 * the model — the same machinery the app's dev panel uses, so the seed
 * can never drift from the learner model's wire format.
 */
const curriculum = theBasics();

function seedForDay(day: number): string {
  const first = curriculum.days?.find((d) => d.day === day)?.nodes[0];
  if (!first) throw new Error(`no day ${day} in the band`);
  return model.serialize(stateWhere(curriculum, model, { nodeId: first }));
}

/** Seed the door (one selected player) plus that player's progress —
 * state lives under the per-profile key — then open the lesson. */
async function startAtDay(page: Page, day: number): Promise<void> {
  await page.addInitScript(
    ({ registryKey, registry, stateKey, state }) => {
      localStorage.setItem(registryKey, registry);
      localStorage.setItem(stateKey, state);
    },
    {
      registryKey: 'chess-tutor/profiles/v1',
      registry: JSON.stringify({
        version: 1,
        current: 'p1',
        profiles: [{ id: 'p1', name: 'Niboo', piece: '♜' }],
      }),
      stateKey: `${STORAGE_KEY}/p1`,
      state: seedForDay(day),
    },
  );
  await page.goto('/play.html');
}

test('Day 2: a learner masters the bishop start to finish', async ({ page }) => {
  await startAtDay(page, 2);
  await expect(page.locator('#day-badge')).toHaveText('Day 2');
  await expect(page.locator('#node-title')).toHaveText('The Bishop: Diagonals');
  await expect(page.locator('#puzzle-count')).toHaveText('Puzzle 1 of 3');
  // The serve gate has cleared the exercise once the select hint shows.
  await expect(page.locator('#feedback')).toContainText('Click your bishop');

  // The nudge copy is the bishop node's data, not rook copy: select the
  // bishop, then click a straight-line square it can never reach.
  await sq(page, 'c1').click();
  await sq(page, 'c4').click();
  await expect(page.locator('#feedback')).toContainText('diagonals');
  await expect(sq(page, 'c1').locator('.piece')).toHaveText('♝');
  await expect(sq(page, 'c1').locator('.piece')).toHaveClass(/white-piece/);

  // bishop-race-01: c1 → g5 → d8 (the moved bishop stays selected).
  await clickSquares(page, ['g5', 'd8']);
  await expect(page.locator('#feedback')).toContainText('Made it');
  await next(page);

  // bishop-race-02: around the own-pawn roadblock: f1 → h3 → c8 → a6.
  await clickSquares(page, ['f1', 'h3', 'c8', 'a6']);
  await expect(page.locator('#feedback')).toContainText('Made it');
  await next(page);

  // 2-of-3 mastered → checkpoint: b1 → g6 → e8.
  await expect(page.locator('#phase')).toHaveText('Checkpoint');
  await clickSquares(page, ['b1', 'g6', 'e8']);
  await next(page);

  // bishop-gobble-01: selecting a capturer explains the red ring.
  await expect(page.locator('#node-title')).toHaveText('The Bishop: Capturing');
  await sq(page, 'c1').click();
  await expect(page.locator('#feedback')).toContainText('red ring');
  await clickSquares(page, ['f4', 'e5', 'g3']);
  await expect(page.locator('#feedback')).toContainText('Gobbled them all');
  await next(page);

  // bishop-gobble-02: five pawns, zig-zag.
  await clickSquares(page, ['e3', 'd4', 'c5', 'e7', 'f6', 'g7', 'b2']);
  await expect(page.locator('#feedback')).toContainText('Gobbled them all');
  await next(page);

  // Checkpoint: four pawns.
  await expect(page.locator('#phase')).toHaveText('Checkpoint');
  await clickSquares(page, ['f1', 'd3', 'e4', 'c6', 'b7']);
  await expect(page.locator('#feedback')).toContainText('Gobbled them all');
  await next(page);

  // Day boundary: celebration, then straight into the queen.
  await expect(page.locator('#node-title')).toContainText('Day 2 complete');
  await expect(page.locator('.chip.mastered')).toHaveCount(2);
  await page.getByRole('button', { name: 'Start Day 3: The Queen' }).click();
  await expect(page.locator('#node-title')).toHaveText('The Queen: Every Direction');
});

test('Day 5: pawns march, munch and PROMOTE on the real board', async ({ page }) => {
  await startAtDay(page, 5);
  await expect(page.locator('#day-badge')).toHaveText('Day 5');
  await expect(page.locator('#node-title')).toHaveText('The Pawn: Marching');
  await expect(page.locator('#feedback')).toContainText('Click a pawn');

  // pawn-march-01: the first-move double step, in one move.
  await clickSquares(page, ['e2', 'e4']);
  await expect(page.locator('#feedback')).toContainText('Made it');
  await next(page);

  // pawn-march-02: the promotion race — the pawn must BECOME a queen.
  await clickSquares(page, ['b5', 'b6', 'b7', 'b8']);
  await expect(page.locator('#feedback')).toContainText('QUEEN');
  // The pawn transformed: a WHITE queen stands on b8.
  await expect(sq(page, 'b8').locator('.piece')).toHaveText('♛');
  await expect(sq(page, 'b8').locator('.piece')).toHaveClass(/white-piece/);
  await next(page);

  // Checkpoint: g2 → g4 → g5.
  await expect(page.locator('#phase')).toHaveText('Checkpoint');
  await clickSquares(page, ['g2', 'g4', 'g5']);
  await next(page);

  // pawn-gobble-01: the diagonal-bite zig-zag.
  await expect(page.locator('#node-title')).toHaveText('The Pawn: Gobbling');
  await clickSquares(page, ['e4', 'd5', 'e6', 'f7']);
  await expect(page.locator('#feedback')).toContainText('Gobbled them all');
  await next(page);

  // pawn-gobble-02: capture up the staircase, promoting on the last bite.
  await clickSquares(page, ['e5', 'f6', 'g7', 'h8']);
  await expect(page.locator('#feedback')).toContainText('QUEEN');
  await expect(sq(page, 'h8').locator('.piece')).toHaveText('♛');
  await expect(sq(page, 'h8').locator('.piece')).toHaveClass(/white-piece/);
  await next(page);

  // Checkpoint, then the day boundary into the king.
  await expect(page.locator('#phase')).toHaveText('Checkpoint');
  await clickSquares(page, ['e4', 'd5', 'e6', 'd7']);
  await next(page);
  await expect(page.locator('#node-title')).toContainText('Day 5 complete');
  await page.getByRole('button', { name: 'Start Day 6: The King' }).click();
  await expect(page.locator('#node-title')).toHaveText('The King: One Careful Step');
});

test('Day 7: value picks, two-piece teamwork, and the band-complete screen', async ({ page }) => {
  await startAtDay(page, 7);
  await expect(page.locator('#day-badge')).toHaveText('Day 7');
  await expect(page.locator('#node-title')).toHaveText('Piece Values: The Best Prize');
  await expect(page.locator('#feedback')).toContainText('what it can grab');

  // value-pick-01: one move — take the knight (3), not the pawn (1).
  await clickSquares(page, ['d4', 'd8']);
  await expect(page.locator('#feedback')).toContainText('Gobbled them all in 1 move!');
  await next(page);

  // value-pick-02: the rook (5), not the pawn (1).
  await clickSquares(page, ['c1', 'g5']);
  await expect(page.locator('#feedback')).toContainText('Gobbled them all');
  await next(page);

  // Checkpoint: the knight grabs the rook, not the pawn.
  await expect(page.locator('#phase')).toHaveText('Checkpoint');
  await clickSquares(page, ['c3', 'd5']);
  await next(page);

  // the-whole-army: two pieces share one goal; switching selection
  // between them mid-puzzle is part of the mechanic under test.
  await expect(page.locator('#node-title')).toHaveText('The Whole Army');
  // army-gobble-01: rook eats a5, b5, e5; bishop eats d3.
  await clickSquares(page, ['a1', 'a5', 'b5', 'e5', 'f1', 'd3']);
  await expect(page.locator('#feedback')).toContainText('Gobbled them all in 4 moves');
  await next(page);

  // army-gobble-02: knight c3, d5; rook h5, e5.
  await clickSquares(page, ['b1', 'c3', 'd5', 'h1', 'h5', 'e5']);
  await expect(page.locator('#feedback')).toContainText('Gobbled them all');
  await next(page);

  // Checkpoint: rook e6, b6; bishop f4.
  await expect(page.locator('#phase')).toHaveText('Checkpoint');
  await clickSquares(page, ['e1', 'e6', 'b6', 'c1', 'f4']);
  await next(page);

  // The whole band is mastered: celebration from curriculum data.
  await expect(page.locator('#node-title')).toContainText('The Basics — complete');
  await expect(page.locator('#day-badge')).toHaveText('All 7 days');
  await expect(page.locator('#prompt')).toContainText('checkmate');
  await expect(page.locator('.chip.mastered')).toHaveCount(7);
  await expect(
    page.getByRole('button', { name: 'Play again from the start' }),
  ).toBeVisible();
});
