// The Video quality setting: popup and app page.
const { test, expect } = require('./fixtures');

const OPTIONS = [
  ['best', 'Best', 'Up to 1080p, plays everywhere. Takes a few seconds longer.'],
  ['original', 'Original', 'Up to 1080p, exactly as Instagram stores it. Fastest, but may not open in QuickTime, Photos or iMovie.'],
  ['standard', 'Standard', 'Up to 720p, a single file, fastest. The size Instagram plays on the web.'],
];

async function openPopup(context, extensionId) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.evaluate(() => chrome.storage.local.clear());
  await page.click('#settings');
  await page.waitForTimeout(500);
  return page;
}
async function openApp(context, extensionId) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/app.html#settings`);
  await page.evaluate(() => chrome.storage.local.remove('videoQuality'));
  await page.reload();
  return page;
}

for (const [where, open, scope] of [['popup', openPopup, '.settings-body'], ['app', openApp, '.settings']]) {
  test(`${where}: Video quality section after Photo size with three options`, async ({ context, extensionId }) => {
    const page = await open(context, extensionId);
    const heads = await page.locator(`${scope} h2`).allTextContents();
    expect(heads.indexOf('Video quality')).toBe(heads.indexOf('Photo size') + 1);
    await expect(page.locator('input[name=video-quality]')).toHaveCount(3);
    for (const [value, title, desc] of OPTIONS) {
      const label = page.locator(`label.setting-option:has(input[name=video-quality][value=${value}])`);
      await expect(label.locator('b')).toHaveText(title);
      await expect(label.locator('.desc')).toHaveText(desc);
    }
    await expect(page.locator('input[name=video-quality][value=best]')).toBeChecked();
  });

  test(`${where}: choosing Original stores it`, async ({ context, extensionId }) => {
    const page = await open(context, extensionId);
    await page.check('input[name=video-quality][value=original]');
    await expect.poll(() => page.evaluate(() => chrome.storage.local.get('videoQuality'))).toEqual({ videoQuality: 'original' });
  });
}

test('a change in the popup shows in an open app page', async ({ context, extensionId }) => {
  const app = await openApp(context, extensionId);
  const popup = await openPopup(context, extensionId);
  await popup.check('input[name=video-quality][value=standard]');
  await expect(app.locator('input[name=video-quality][value=standard]')).toBeChecked();
});

test('export includes videoQuality', async ({ context, extensionId }) => {
  const page = await openPopup(context, extensionId);
  await page.evaluate(() => chrome.storage.local.set({ videoQuality: 'original' }));
  const data = await page.evaluate(() => KeepKeep.exportData());
  expect(data.settings.videoQuality).toBe('original');
});

test('popup settings do not overflow horizontally', async ({ context, extensionId }) => {
  const page = await openPopup(context, extensionId);
  expect(await page.evaluate(() => document.body.scrollWidth)).toBeLessThanOrEqual(400);
});
