/**
 * P3 + P6 gate, end to end in a real browser: a learner completes the
 * whole Day 1 lesson — board-orientation, rook-movement (Race), and
 * rook-capture (Gobble) — through the actual play surface, with every
 * interaction going through the WASM truth core, and illegal moves
 * having no effect on the board.
 *
 * Run with: pnpm --filter @chess/web e2e   (vite preview is started
 * automatically by playwright.config.ts).
 */
import { expect, test, type Page } from '@playwright/test';

const sq = (page: Page, name: string) => page.locator(`[data-square="${name}"]`);

async function clickSquares(page: Page, squares: string[]): Promise<void> {
  for (const s of squares) {
    await sq(page, s).click();
  }
}

async function next(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Next' }).click();
}

/** Seed the door: one selected player with no saved progress. The lesson
 * lives at /play.html; without a chosen profile it bounces to the door. */
async function seedPlayer(page: Page): Promise<void> {
  await page.addInitScript(
    ({ key, value }) => localStorage.setItem(key, value),
    {
      key: 'chess-tutor/profiles/v1',
      value: JSON.stringify({
        version: 1,
        current: 'p1',
        profiles: [{ id: 'p1', name: 'Niboo', piece: '♜' }],
      }),
    },
  );
}

test('a learner completes Day 1 start to finish', async ({ page }) => {
  await seedPlayer(page);
  await page.goto('/play.html');
  // The chosen player is visible in the header, linking back to the door.
  await expect(page.locator('#player-chip')).toHaveText('♜ Niboo');

  // ---- Node A: board-orientation (find-square) --------------------------
  await expect(page.locator('#node-title')).toHaveText('The Board');
  // 4-of-5 mastery + checkpoint → the node is 5 puzzles long.
  await expect(page.locator('#puzzle-count')).toHaveText('Puzzle 1 of 5');
  for (const target of ['e4', 'a1', 'h8', 'c6']) {
    await expect(page.locator('#prompt')).toContainText(target);
    await sq(page, target).click();
    await expect(page.locator('#feedback')).toContainText('Yes');
    await next(page);
  }
  // 4-of-5 practice mastery met → checkpoint.
  await expect(page.locator('#phase')).toHaveText('Checkpoint');
  await expect(page.locator('#puzzle-count')).toHaveText('Puzzle 5 of 5');
  await sq(page, 'g5').click();
  await next(page);

  // ---- Node B: rook-movement (Race) -------------------------------------
  await expect(page.locator('#node-title')).toHaveText('The Rook: Straight Lines');

  // Illegal interactions must not change the board: select the rook and
  // click a diagonal square — the rook must stay on a1 and a nudge shows.
  await sq(page, 'a1').click();
  await sq(page, 'b2').click();
  await expect(page.locator('#feedback')).toContainText('row or column');
  // Pieces render as filled glyphs for both sides; CSS paints White.
  await expect(sq(page, 'a1').locator('.piece')).toHaveText('♜');
  await expect(sq(page, 'a1').locator('.piece')).toHaveClass(/white-piece/);
  await expect(sq(page, 'b2').locator('.piece')).toHaveText('');

  // rook-race-01: a1 → a8 → h8 (the moved rook stays selected).
  await clickSquares(page, ['a8', 'h8']);
  await expect(page.locator('#feedback')).toContainText('Made it');
  await next(page);

  // rook-race-02: own pawn blocks the a-file; go around: h1, h8, a8.
  await clickSquares(page, ['a1', 'h1', 'h8', 'a8']);
  await expect(page.locator('#feedback')).toContainText('Made it');
  await next(page);

  // 2-of-3 mastery met → checkpoint: c3 → c6 → f6.
  await expect(page.locator('#phase')).toHaveText('Checkpoint');
  await clickSquares(page, ['c3', 'c6', 'f6']);
  await next(page);

  // ---- Node C: rook-capture (Gobble) -------------------------------------
  await expect(page.locator('#node-title')).toHaveText('The Rook: Capturing');

  // rook-gobble-01: eat pawns on b3, e5, c7.
  await clickSquares(page, ['a1', 'b1', 'b3', 'e3', 'e5', 'c5', 'c7']);
  await expect(page.locator('#feedback')).toContainText('Gobbled them all');
  await next(page);

  // rook-gobble-02 (the roadmap's scenario): five pawns.
  await clickSquares(
    page,
    ['e1', 'h1', 'h3', 'c3', 'c4', 'b4', 'b7', 'b5', 'f5', 'f8', 'g8'],
  );
  await expect(page.locator('#feedback')).toContainText('Gobbled them all');
  await next(page);

  // 2-of-3 mastery met → checkpoint: four pawns on b6, f6, c3, f3.
  await expect(page.locator('#phase')).toHaveText('Checkpoint');
  await clickSquares(page, ['e1', 'e3', 'c3', 'c6', 'b6', 'f6', 'f3']);
  await expect(page.locator('#feedback')).toContainText('Gobbled them all');
  await next(page);

  // ---- Day boundary -------------------------------------------------------
  // Finishing the day's last node lands on the day-complete celebration:
  // a natural stopping point, with Day 2 one tap away.
  await expect(page.locator('#node-title')).toContainText('Day 1 complete');
  await expect(page.locator('.chip.mastered')).toHaveCount(3);
  await expect(page.locator('#day-badge')).toHaveText('Day 1');
  await page.getByRole('button', { name: 'Start Day 2: The Bishop' }).click();
  await expect(page.locator('#day-badge')).toHaveText('Day 2');
  await expect(page.locator('#node-title')).toHaveText('The Bishop: Diagonals');
});

test('a failed budget attempt is recorded and the lesson moves on', async ({ page }) => {
  await seedPlayer(page);
  await page.goto('/play.html');

  // Fast-forward through board-orientation.
  for (const target of ['e4', 'a1', 'h8', 'c6', 'g5']) {
    await sq(page, target).click();
    await next(page);
  }

  // rook-race-01 has a 2-move budget; burn it without reaching h8.
  await expect(page.locator('#meta')).toContainText('Moves left: 2');
  await clickSquares(page, ['a1', 'a2', 'a3']);
  await expect(page.locator('#feedback')).toContainText('Out of moves');
  await next(page);

  // The outer loop continues (next practice exercise), still on node B.
  await expect(page.locator('#node-title')).toHaveText('The Rook: Straight Lines');
  await expect(page.locator('#phase')).toHaveText('Practice');
  // The failed attempt earned no credit: still puzzle 1 of the node's 3.
  await expect(page.locator('#puzzle-count')).toHaveText('Puzzle 1 of 3');
});

test('a persistent Back/Next pager reviews completed puzzles, read-only', async ({ page }) => {
  await seedPlayer(page);
  await page.goto('/play.html');

  // Puzzle 1, live: no Back (nothing behind it), Next present but disabled.
  await expect(page.locator('#prompt')).toContainText('e4');
  await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled();

  // Answering enables Next; advance to puzzle 2.
  await sq(page, 'e4').click();
  await expect(page.locator('#feedback')).toContainText("that's e4");
  await expect(page.getByRole('button', { name: 'Next' })).toBeEnabled();
  await next(page);

  // Puzzle 2, live: Back now available (a prior puzzle exists), Next disabled.
  await expect(page.locator('#prompt')).toContainText('a1');
  await expect(page.getByRole('button', { name: 'Back' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled();

  await sq(page, 'a1').click();
  await expect(page.locator('#feedback')).toContainText("that's a1");

  // Back → read-only review of puzzle 1.
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.locator('#puzzle-count')).toContainText('review');
  await expect(page.locator('#feedback')).toContainText("that's e4");
  // The board is inert in review — clicking a square changes nothing.
  await sq(page, 'h4').click();
  await expect(page.locator('#feedback')).toContainText("that's e4");
  // Oldest entry: no further Back.
  await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(0);

  // Next walks forward: puzzle 2 review, then on to live puzzle 3.
  await next(page);
  await expect(page.locator('#feedback')).toContainText("that's a1");
  await expect(page.locator('#puzzle-count')).toContainText('review');
  await next(page);
  await expect(page.locator('#prompt')).toContainText('h8');
  await expect(page.locator('#puzzle-count')).not.toContainText('review');
});

test('a wrong square is a gentle nudge, never a red error', async ({ page }) => {
  await seedPlayer(page);
  await page.goto('/play.html');

  await expect(page.locator('#prompt')).toContainText('e4');
  await sq(page, 'a1').click(); // wrong — the target is e4
  await expect(page.locator('#feedback')).toContainText('Good try');
  // Never red: a miss is a gentle nudge, never the error styling.
  await expect(page.locator('#feedback')).toHaveAttribute('data-kind', 'nudge');
  // The board stays live — the right square still lands it (retry is inline).
  await sq(page, 'e4').click();
  await expect(page.locator('#feedback')).toContainText("that's e4");
  await expect(page.getByRole('button', { name: 'Next' })).toBeEnabled();
});

test('a failed scenario is gentle and one tap from a retry', async ({ page }) => {
  await seedPlayer(page);
  await page.goto('/play.html');

  // Fast-forward to the first rook scenario (rook-race-01, 2-move budget).
  for (const target of ['e4', 'a1', 'h8', 'c6', 'g5']) {
    await sq(page, target).click();
    await next(page);
  }

  // Burn the budget without reaching the goal.
  await clickSquares(page, ['a1', 'a2', 'a3']);
  await expect(page.locator('#feedback')).toContainText('Out of moves');
  // Never red: the failure is a nudge, not an error.
  await expect(page.locator('#feedback')).toHaveAttribute('data-kind', 'nudge');

  // Retry is one tap — "Again" replays the exact same puzzle from the start.
  await page.getByRole('button', { name: 'Again' }).click();
  await expect(page.locator('#node-title')).toHaveText('The Rook: Straight Lines');
  await expect(page.locator('#puzzle-count')).toHaveText('Puzzle 1 of 3');
  await expect(page.locator('#meta')).toContainText('Moves left: 2');

  // This time solve it: a1 → a8 → h8.
  await clickSquares(page, ['a1', 'a8', 'h8']);
  await expect(page.locator('#feedback')).toContainText('Made it');
});
