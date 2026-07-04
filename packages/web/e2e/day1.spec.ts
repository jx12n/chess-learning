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
  await page.getByRole('button', { name: 'Continue' }).click();
}

test('a learner completes Day 1 start to finish', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

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
  await expect(sq(page, 'a1').locator('.piece')).toHaveText('♖');
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

  // ---- Done ---------------------------------------------------------------
  await expect(page.locator('#node-title')).toContainText('Day 1 complete');
  await expect(page.locator('.chip.mastered')).toHaveCount(3);
});

test('a failed budget attempt is recorded and the lesson moves on', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

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
