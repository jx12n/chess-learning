/**
 * The front door, the story page, and player profiles: the landing page
 * offers name cards ("Who's playing today?"), creates new players,
 * migrates the pre-profile save into the first student's profile, and
 * keeps each player's journey separate. The lesson page without a
 * chosen player bounces back to the door.
 */
import { expect, test, type Page } from '@playwright/test';
import {
  counterLearnerModel as model,
  stateWhere,
  theBasics,
} from '@chess/curriculum';

const REGISTRY_KEY = 'chess-tutor/profiles/v1';
const STATE_PREFIX = 'chess-tutor/learner-state/v1';

const curriculum = theBasics();

/** Real learner state (via the curriculum's own simulated perfect
 * learner) whose next step is the given day's first node. */
function seedForDay(day: number): string {
  const first = curriculum.days?.find((d) => d.day === day)?.nodes[0];
  if (!first) throw new Error(`no day ${day} in the band`);
  return model.serialize(stateWhere(curriculum, model, { nodeId: first }));
}

/** Seed storage on the live document, then reload so the page reads it.
 * (Not addInitScript: these tests navigate more than once, and re-seeding
 * on every navigation would undo what the app itself wrote.) */
async function seed(page: Page, entries: Record<string, string>): Promise<void> {
  await page.goto('/');
  await page.evaluate((kv) => {
    localStorage.clear();
    for (const [key, value] of Object.entries(kv)) localStorage.setItem(key, value);
  }, entries);
  await page.reload();
}

test('a brand-new kid names themself and starts Day 1', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('Chess, one piece at a time.');
  // The hero teaches its first secret before a single click: + and ×.
  await expect(page.locator('.mini-board')).toHaveCount(2);
  // Parents are promised a journey, not a seven-day product.
  await expect(page.locator('.parent-strip')).toContainText('built for the long game');

  await page.getByRole('button', { name: 'New player' }).click();
  await page.getByLabel("What's your name?").fill('Ada');
  await page.getByRole('button', { name: '♝', exact: true }).click();
  await page.getByRole('button', { name: "Let's play!" }).click();

  await expect(page).toHaveURL(/\/play\.html$/);
  await expect(page.locator('#player-chip')).toHaveText('♝ Ada');
  await expect(page.locator('#day-badge')).toHaveText('Day 1');
  await expect(page.locator('#node-title')).toHaveText('The Board');
});

test("the pre-profile save becomes the first student's profile", async ({ page }) => {
  // A save from before profiles existed, partway into the band.
  await seed(page, { [STATE_PREFIX]: seedForDay(2) });

  const card = page.getByRole('button', { name: /Niboo/ });
  await expect(card).toContainText('Day 2');
  await expect(card).toContainText('saved game');
  await card.click();

  // The journey resumes exactly where the save left off…
  await expect(page.locator('#node-title')).toHaveText('The Bishop: Diagonals');
  // …and the save has MOVED under the new profile, not been copied.
  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys).not.toContain(STATE_PREFIX);
  expect(keys.some((k) => k.startsWith(`${STATE_PREFIX}/`))).toBe(true);
});

test('two players keep separate journeys', async ({ page }) => {
  await seed(page, {
    [REGISTRY_KEY]: JSON.stringify({
      version: 1,
      current: null,
      profiles: [
        { id: 'p1', name: 'Niboo', piece: '♜' },
        { id: 'p2', name: 'Ada', piece: '♞' },
      ],
    }),
    [`${STATE_PREFIX}/p1`]: seedForDay(3),
  });

  await expect(page.getByRole('button', { name: /Niboo/ })).toContainText('Day 3');
  await expect(page.getByRole('button', { name: /Ada/ })).toContainText('New');

  await page.getByRole('button', { name: /Ada/ }).click();
  await expect(page.locator('#player-chip')).toHaveText('♞ Ada');
  await expect(page.locator('#node-title')).toHaveText('The Board');

  // Switch player through the header chip: back to the door, pick Niboo.
  await page.locator('#player-chip').click();
  await page.getByRole('button', { name: /Niboo/ }).click();
  await expect(page.locator('#player-chip')).toHaveText('♜ Niboo');
  await expect(page.locator('#node-title')).toHaveText('The Queen: Every Direction');
});

test('the lesson without a chosen player bounces to the door', async ({ page }) => {
  await page.goto('/play.html');
  await expect(page.locator('h1')).toHaveText('Chess, one piece at a time.');
});

test('the story page tells the truth about the school', async ({ page }) => {
  await page.goto('/about.html');
  await expect(page.locator('h1')).toContainText('One of one chess school');
  // The day list is rendered from curriculum data — all of it.
  await expect(page.locator('.day-list li')).toHaveCount(curriculum.days?.length ?? 0);
  await expect(page.locator('.day-list')).toContainText('The Bishop');
  // The story frames the week as a beginning, not the product.
  await expect(page.locator('article.about')).toContainText('the first lap');

  await page.getByRole('link', { name: /Who's playing/ }).click();
  await expect(page.locator('h1')).toHaveText('Chess, one piece at a time.');
});
