// The Downloads view (app/downloads.js): what KeepKeep downloaded, from its
// record in IndexedDB; the side panel with Download again / Save to Media;
// the "Skip files downloaded before" switch; Forget.
const { test, expect } = require('./fixtures');

const PIC = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
async function open(context, extensionId, posts) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/app.html#about`);
  await page.evaluate(async (posts) => {
    await chrome.storage.local.clear();
    for (const p of posts) await KeepKeepDownloads.putPost(p);
  }, posts);
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
  await page.locator('.setting-toggle:has(#skip-downloaded)').click();
  await expect.poll(() => page.evaluate(async () => (await chrome.storage.local.get('skipDownloaded')).skipDownloaded)).toBe(false);
  await expect(page.locator('.downloads-head .count-line')).toHaveText('2 downloaded');
  await page.click('#forget');
  await page.click('#forget-yes');
  await expect(page.locator('.grid .card')).toHaveCount(0);
  await expect(page.locator('.empty')).toHaveText('Nothing downloaded yet. Posts and stories you download appear here.');
  expect(await page.evaluate(async () => (await KeepKeepDownloads.posts()).length)).toBe(0);
});
