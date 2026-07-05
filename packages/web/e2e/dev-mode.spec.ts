/**
 * Developer options: the backstage panel exists ONLY behind the sticky
 * ?dev=1 flag (kid-safety is DOM absence, not CSS), plays on an isolated
 * learner profile, jumps via real state synthesis, sandboxes any
 * exercise behind the normal serve gate, and auto-solves with the
 * verifier's proven solution.
 */
import { expect, test, type Page } from '@playwright/test';

/** The seeded kid's per-profile state key — dev play must never touch it. */
const KID_KEY = 'chess-tutor/learner-state/v1/p1';

/** The lesson lives behind the door: seed one selected player so
 * /play.html serves (and dev-exit returns to) the kid experience. */
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

test('developer options are absent from the DOM unless enabled', async ({ page }) => {
  await seedPlayer(page);
  await page.goto('/play.html');
  await expect(page.locator('#node-title')).toHaveText('The Board');
  await expect(page.locator('#dev-panel')).toHaveCount(0);
});

test('enable, jump, sandbox, solve, isolated profile, sticky flag, clean exit', async ({ page }) => {
  await seedPlayer(page);
  await page.goto('/play.html?dev=1');
  await expect(page.locator('#dev-panel')).toBeVisible();
  // Fresh dev profile starts at the beginning, kid profile untouched.
  await expect(page.locator('#node-title')).toHaveText('The Board');

  // Solve current: the panel answers the find-square for us.
  await page.locator('#dev-solve').click();
  await expect(page.locator('#feedback')).toContainText("that's e4");

  // Jump straight to Day 5.
  await page.locator('#dev-day-5').click();
  await expect(page.locator('#day-badge')).toHaveText('Day 5');
  await expect(page.locator('#node-title')).toHaveText('The Pawn: Marching');
  await expect(page.locator('#dev-readout')).toContainText('pawn-march');

  // Jump to a specific node's checkpoint.
  await page.locator('#dev-day-1').click();
  await page.locator('#dev-node-rook-capture-check').click();
  await expect(page.locator('#phase')).toHaveText('Checkpoint');
  await expect(page.locator('#prompt')).toContainText('capture all four');

  // Reproduce the day-boundary interstitial on demand.
  await page.locator('#dev-wrapup-1').click();
  await expect(page.locator('#node-title')).toContainText('Day 1 complete');

  // Sandbox any exercise — here Day 5's capture-to-promotion — and let
  // the panel replay the verifier's proven solution.
  await page.locator('#dev-day-5').click();
  await page.locator('#dev-ex-pawn-gobble-02').click();
  await expect(page.locator('#phase')).toHaveText('Sandbox');
  await expect(page.locator('#puzzle-count')).toHaveText('not recorded');
  await page.locator('#dev-solve').click();
  await expect(page.locator('#feedback')).toContainText('QUEEN', { timeout: 15_000 });
  await page.getByRole('button', { name: 'Back to the lesson' }).click();
  await expect(page.locator('#phase')).toHaveText('Practice');

  // Jump to the band-complete screen.
  await page.locator('#dev-complete').click();
  await expect(page.locator('#node-title')).toContainText('The Basics — complete');

  // Everything above lived on the dev profile: the kid's key never written.
  expect(await page.evaluate((k) => localStorage.getItem(k), KID_KEY)).toBeNull();

  // The flag is sticky across plain reloads…
  await page.goto('/play.html');
  await expect(page.locator('#dev-panel')).toBeVisible();

  // …and Exit returns to the kid app: no dev DOM, fresh real progress.
  await page.locator('#dev-exit').click();
  await expect(page.locator('#dev-panel')).toHaveCount(0);
  await expect(page.locator('#node-title')).toHaveText('The Board');
});
