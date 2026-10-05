// The side panel: a media card opens the post (Instagram's embed) with
// KeepKeep's details; lists, Download, Remove (with Undo); ← / →; Escape.
const { test, expect } = require('./fixtures');

const DATA = {
  lists: [{ id: 'l1', name: 'Recipes', kind: 'm' }, { id: 'l2', name: 'Travel', kind: 'm' }, { id: 'p1', name: 'People', kind: 'p' }],
  'm:AAA': { key: 'AAA', code: 'AAA', type: 'post', username: 'alice', url: 'https://www.instagram.com/p/AAA/', lists: ['l1'], addedAt: 3 },
  'm:BBB': { key: 'BBB', code: 'BBB', type: 'reel', username: 'bob', url: 'https://www.instagram.com/reel/BBB/', lists: [], addedAt: 2 },
  'm:story:9': { key: 'story:9', type: 'story-photo', username: 'carol', url: 'https://www.instagram.com/stories/carol/9/', thumb: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', lists: [], addedAt: 1 },
};

async function open(context, extensionId) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/app.html`);
  await page.evaluate(async (d) => { await chrome.storage.local.clear(); await chrome.storage.local.set(d); }, DATA);
  await page.goto(`chrome-extension://${extensionId}/app.html#media`);
  await page.reload();
  await expect(page.locator('.grid .card')).toHaveCount(3);
  return page;
}
const stored = (page, k) => page.evaluate(async (k) => (await chrome.storage.local.get(k))[k], k);

test('clicking a card opens the post with its details; a click on the dimmed page or × closes', async ({ context, extensionId }) => {
  const page = await open(context, extensionId);
  await page.click('.card[data-key="m:AAA"] .preview');
  const panel = page.locator('#peek');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.peek-who b')).toHaveText('@alice');
  await expect(panel.locator('.peek-embed')).toHaveAttribute('src', 'https://www.instagram.com/p/AAA/embed/captioned/');
  await expect(panel.locator('a.peek-btn')).toHaveAttribute('href', 'https://www.instagram.com/p/AAA/');
  await expect(page.locator('.card[data-key="m:AAA"]')).toHaveClass(/peeking/);
  expect(context.pages().filter((p) => p.url().includes('instagram.com/p/AAA'))).toEqual([]); // no new tab
  // The page behind dims; a click on it closes the panel (× still does too).
  await expect(page.locator('#peek-scrim')).toBeVisible();
  await page.mouse.click(400, 500);
  await expect(panel).toHaveCount(0);
  await expect(page.locator('#peek-scrim')).toHaveCount(0);
  await page.click('.card[data-key="m:AAA"] .preview');
  await page.click('#peek button[aria-label="Close"]');
  await expect(panel).toHaveCount(0);
});

test('lists: only the post\'s own lists, × removes, + Add to list finds or creates', async ({ context, extensionId }) => {
  const page = await open(context, extensionId);
  await page.click('.card[data-key="m:AAA"] .preview');
  await expect(page.locator('#peek .peek-list.on')).toHaveText(['Recipes']); // Travel (not linked) and People (profile list) hidden
  await page.click('#peek .peek-add');
  await expect(page.locator('#peek .peek-option')).toHaveText(['Travel']);
  await page.click('#peek .peek-option:has-text("Travel")');
  await expect.poll(() => stored(page, 'm:AAA').then((r) => r.lists)).toEqual(['l1', 'l2']);
  await expect(page.locator('#peek .peek-list.on')).toHaveText(['Recipes', 'Travel']);
  await expect(page.locator('#peek .peek-picker')).toHaveCount(0);
  await page.click('#peek .peek-list.on:has-text("Recipes") .peek-unlist');
  await expect.poll(() => stored(page, 'm:AAA').then((r) => r.lists)).toEqual(['l2']);
  // Typing a new name creates the list and adds the post to it.
  await page.click('#peek .peek-add');
  await page.fill('#peek .peek-search', 'Shoes');
  await expect(page.locator('#peek .peek-options')).toHaveText('Create "Shoes"'); // nothing else (no stray text)
  await page.keyboard.press('Enter');
  await expect(page.locator('#peek .peek-list.on')).toHaveText(['Travel', 'Shoes']);
  await expect(page.locator('#peek .peek-embed')).toHaveCount(1); // the post stays loaded
});

test('a spinner shows until the post has loaded', async ({ context, extensionId }) => {
  let release;
  const held = new Promise((r) => { release = r; });
  await context.route(/\/p\/AAA\/embed\/captioned\//, async (route) => { await held; route.fulfill({ contentType: 'text/html', body: '<p>post</p>' }); });
  const page = await open(context, extensionId);
  await page.click('.card[data-key="m:AAA"] .preview');
  await expect(page.locator('#peek .peek-spinner')).toBeVisible();
  release();
  await expect(page.locator('#peek .peek-spinner')).toBeHidden();
});

test('← / → step through the grid; Escape closes without clearing the selection', async ({ context, extensionId }) => {
  const page = await open(context, extensionId);
  await page.click('.card[data-key="m:BBB"] .select');
  await page.click('.card[data-key="m:AAA"] .preview');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#peek .peek-who b')).toHaveText('@bob');
  await expect(page.locator('#peek .peek-embed')).toHaveAttribute('src', /\/p\/BBB\/embed\/captioned\/$/);
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#peek .peek-who b')).toHaveText('@alice');
  await page.keyboard.press('Escape');
  await expect(page.locator('#peek')).toHaveCount(0);
  await expect(page.locator('#bulk .count')).toHaveText('1 selected');
});

test('a story shows its saved picture, not an embed', async ({ context, extensionId }) => {
  const page = await open(context, extensionId);
  await page.click('.card[data-key="m:story:9"] .preview');
  await expect(page.locator('#peek .peek-embed')).toHaveCount(0);
  await expect(page.locator('#peek .peek-still img')).toHaveAttribute('src', DATA['m:story:9'].thumb);
});

test('Remove closes the panel and offers Undo', async ({ context, extensionId }) => {
  const page = await open(context, extensionId);
  await page.click('.card[data-key="m:AAA"] .preview');
  await page.click('#peek .peek-btn.danger');
  await expect(page.locator('#peek')).toHaveCount(0);
  await expect.poll(() => stored(page, 'm:AAA')).toBeUndefined();
  await page.click('#toast button:has-text("Undo")');
  await expect.poll(() => stored(page, 'm:AAA')).toEqual(DATA['m:AAA']);
});

test('Download in the panel asks for an Instagram tab like the bulk bar', async ({ context, extensionId }) => {
  const page = await open(context, extensionId);
  await page.click('.card[data-key="m:AAA"] .preview');
  await page.click('#peek button.peek-btn:has-text("Download")');
  await expect(page.locator('#notice')).toContainText('Open Instagram in a tab to download');
});

test('⌘ / Ctrl-click still opens the post in a new tab, no panel', async ({ context, extensionId }) => {
  const page = await open(context, extensionId);
  const tab = context.waitForEvent('page', { predicate: (p) => p.url().includes('/p/AAA/') });
  await page.click('.card[data-key="m:AAA"] .preview', { modifiers: ['ControlOrMeta'] });
  await tab;
  await expect(page.locator('#peek')).toHaveCount(0);
});

test('a drag onto a list does not open the panel', async ({ context, extensionId }) => {
  const page = await open(context, extensionId);
  const card = await page.locator('.card[data-key="m:BBB"]').boundingBox();
  const list = await page.locator('.lists .list[data-id="l1"]').boundingBox();
  await page.mouse.move(card.x + 40, card.y + 40); await page.mouse.down();
  await page.mouse.move(list.x + 30, list.y + list.height / 2, { steps: 12 }); await page.mouse.up();
  await expect.poll(() => stored(page, 'm:BBB').then((r) => r.lists)).toEqual(['l1']);
  await expect(page.locator('#peek')).toHaveCount(0);
});

test('the large view: ⤢ or F opens the post over the page, ← / → step, Escape and the backdrop go back', async ({ context, extensionId }) => {
  const page = await open(context, extensionId);
  await page.click('.card[data-key="m:AAA"] .preview');
  await page.click('#peek button[aria-label="View large"]');
  const full = page.locator('#peek-full');
  await expect(full).toBeVisible();
  await expect(full.locator('.peek-embed')).toHaveAttribute('src', /\/p\/AAA\/embed\/captioned\/$/);
  expect(context.pages().filter((p) => p.url().includes('instagram.com'))).toEqual([]); // no new tab
  await page.keyboard.press('ArrowRight');
  await expect(full.locator('.peek-embed')).toHaveAttribute('src', /\/p\/BBB\/embed\/captioned\/$/);
  await page.keyboard.press('Escape');
  await expect(full).toHaveCount(0);
  await expect(page.locator('#peek')).toBeVisible(); // back to the panel, not closed
  await page.keyboard.press('f');
  await expect(full).toBeVisible();
  await page.mouse.click(10, 10); // the backdrop
  await expect(full).toHaveCount(0);
  await expect(page.locator('#peek .peek-who b')).toHaveText('@bob');
});

test('the large view has a Download button, like the panel', async ({ context, extensionId }) => {
  const page = await open(context, extensionId);
  await page.click('.card[data-key="m:AAA"] .preview');
  await page.keyboard.press('f');
  await page.click('#peek-full button[aria-label="Download"]');
  await expect(page.locator('#notice')).toContainText('Open Instagram in a tab to download');
  await expect(page.locator('#notice')).toBeVisible();
  await expect(page.locator('#peek-full')).toBeVisible(); // stays in the large view
});
