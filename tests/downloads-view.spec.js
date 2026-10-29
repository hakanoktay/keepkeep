// The Downloads view (app/downloads.js): what KeepKeep downloaded, from its
// record in IndexedDB; the side panel with Download again / Save to Media;
// the "Skip files downloaded before" switch; Forget.
const { test, expect } = require('./fixtures');

const PIC = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
async function open(context, extensionId, posts, { firstVisit = false } = {}) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/app.html#about`);
  await page.evaluate(async ([posts, firstVisit]) => {
    await chrome.storage.local.clear();
    if (firstVisit) localStorage.removeItem('keepkeep.downloads.goodToKnow.seen');
    else localStorage.setItem('keepkeep.downloads.goodToKnow.seen', '1'); // the note would cover the first cards
    for (const p of posts) await KeepKeepDownloads.putPost(p);
  }, [posts, firstVisit]);
  await page.goto(`chrome-extension://${extensionId}/app.html#downloads`);
  await page.reload();
  return page;
}
const POSTS = [
  { key: 'AAA', url: 'https://www.instagram.com/p/AAA/', username: 'alice', type: 'post', files: 3, at: Date.now() - 86400000 * 3, thumb: PIC },
  { key: 'story:777', url: 'https://www.instagram.com/stories/bob/777/', username: 'bob', type: 'story', files: 1, at: Date.now() - 1000, thumb: PIC },
];

test('Downloads lists what was downloaded, newest first, with a count in the sidebar', async ({ context, extensionId }) => {
  const page = await open(context, extensionId, POSTS);
  await expect(page.locator('.grid .card')).toHaveCount(2);
  expect(await page.locator('.grid .card').evaluateAll((c) => c.map((x) => x.dataset.key))).toEqual(['d:story:777', 'd:AAA']);
  await expect(page.locator('.card[data-key="d:AAA"] .files')).toHaveText('3 files');
  await expect(page.locator('.card[data-key="d:story:777"] .type')).toHaveText('Story');
  await expect(page.locator('.nav [data-view="downloads"] .count')).toHaveText('2');
  await expect(page.locator('.lists-title')).toHaveCount(0); // no lists here, also right after a reload
  await page.fill('#search', 'bob');
  await expect(page.locator('.grid .card')).toHaveCount(1);
});

test('a card opens the side panel: when, how many files, Save to Media puts it in the collection', async ({ context, extensionId }) => {
  const page = await open(context, extensionId, POSTS);
  await page.click('.card[data-key="d:AAA"]');
  const panel = page.locator('#peek');
  await expect(panel.locator('.peek-who b')).toHaveText('@alice');
  await expect(panel.locator('.peek-date')).toHaveText(/^Downloaded .+ · 3 files$/);
  await expect(panel.locator('.peek-embed')).toHaveAttribute('src', 'https://www.instagram.com/p/AAA/embed/captioned/');
  await panel.locator('#save-to-media').click();
  await expect(panel.locator('#save-to-media')).toHaveText('In Media');
  await expect(panel.locator('#save-to-media')).toBeDisabled();
  const m = await page.evaluate(async () => (await chrome.storage.local.get('m:AAA'))['m:AAA']);
  expect(m).toMatchObject({ key: 'AAA', code: 'AAA', username: 'alice', thumb: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', lists: [] });
  // ← / → step through the Downloads grid; a story shows its picture.
  await page.keyboard.press('ArrowLeft');
  await expect(panel.locator('.peek-who b')).toHaveText('@bob');
  await expect(panel.locator('.peek-still img')).toHaveCount(1);
});

test('Download again asks the Instagram tab to download it even if downloaded before', async ({ context, extensionId }) => {
  const page = await open(context, extensionId, POSTS);
  await page.evaluate(() => {
    window.sent = [];
    chrome.tabs.query = async () => [{ id: 9, active: true, windowId: 1 }];
    chrome.windows.getLastFocused = async () => ({ id: 1 });
    chrome.tabs.sendMessage = async (id, msg) => { window.sent.push(msg); return { ok: true, started: msg.keys.length }; };
  });
  await page.click('.card[data-key="d:story:777"]');
  await page.click('#download-again');
  await expect.poll(() => page.evaluate(() => window.sent)).toEqual([{ type: 'download-keys', keys: ['m:story:777'], force: true }]);
});

test('the switch turns skipping off; Forget clears the list after asking', async ({ context, extensionId }) => {
  const page = await open(context, extensionId, POSTS);
  await expect(page.locator('#skip-downloaded')).toBeChecked(); // on unless turned off
  await page.locator('.skip-toggle label').click();
  await expect.poll(() => page.evaluate(async () => (await chrome.storage.local.get('skipDownloaded')).skipDownloaded)).toBe(false);
  await expect(page.locator('.downloads-title .count-line')).toHaveText('2 downloaded');
  await page.click('#forget');
  await page.click('#forget-yes');
  await expect(page.locator('.grid .card')).toHaveCount(0);
  await expect(page.locator('.empty')).toHaveText('Nothing downloaded yet. Posts and stories you download appear here.');
  expect(await page.evaluate(async () => (await KeepKeepDownloads.posts()).length)).toBe(0);
});

test('the head is one title line and one toolbar; "Good to know" opens by itself on the first visit only', async ({ context, extensionId }) => {
  const page = await open(context, extensionId, POSTS, { firstVisit: true });
  const note = page.locator('#good-to-know');
  await expect(note).toBeVisible();
  await expect(page.locator('#good-to-know-btn')).toHaveAttribute('aria-expanded', 'true');
  await expect(note.locator('li')).toHaveCount(4);
  await expect(note).toContainText("KeepKeep can't see your Downloads folder.");
  await page.waitForTimeout(400);
  await page.screenshot({ path: test.info().outputPath('downloads-open.png') });
  // The count and Forget sit on the title's line; their right edge is the toolbar's.
  const [title, fg, btn, search] = await Promise.all(['h1', '#forget', '#good-to-know-btn', '#search'].map((s) => page.locator(s).boundingBox()));
  expect(Math.abs(fg.y + fg.height / 2 - (title.y + title.height / 2))).toBeLessThan(4);
  expect(Math.abs(fg.x + fg.width - (btn.x + btn.width))).toBeLessThan(2);
  expect(Math.abs(btn.y - search.y)).toBeLessThan(2); // the switch and the note's button share the search's line
  // The note floats over the grid: the grid doesn't move when it closes.
  const before = (await page.locator('.grid').boundingBox()).y;
  await page.mouse.click(1200, 40); // outside
  await expect(note).toBeHidden();
  expect((await page.locator('.grid').boundingBox()).y).toBe(before);
  await page.screenshot({ path: test.info().outputPath('downloads.png') });
  await page.reload();
  await expect(page.locator('#good-to-know')).toBeHidden();
  await page.click('#good-to-know-btn');
  await expect(page.locator('#good-to-know')).toBeVisible();
  // The switch's "?" opens its explanation the same way, and closes Good to know.
  await page.click('#skip-help-btn');
  await expect(page.locator('#skip-help')).toContainText('Skip files downloaded before');
  await expect(page.locator('#good-to-know')).toBeHidden();
  await expect(page.locator('#skip-downloaded')).toBeChecked(); // "?" doesn't flip the switch
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath('help.png') });
  await page.keyboard.press('Escape');
  await expect(page.locator('#skip-help')).toBeHidden();
  await expect(page.locator('#forget')).toHaveText('Clear download history');
  await page.click('#forget');
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath('forget.png') });
});
