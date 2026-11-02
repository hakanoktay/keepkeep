// The popup removes as Instagram's buttons and the app page do: no question,
// and "Undo" brings the item back as it was (lists included) for 6 seconds.
const { test, expect } = require('./fixtures');

const DATA = {
  lists: [{ id: 'l1', name: 'Recipes', kind: 'm' }, { id: 'p1', name: 'Chefs', kind: 'p' }],
  'p:alice': { username: 'alice', addedAt: 2, lists: ['p1'] },
  'm:AAA': { key: 'AAA', code: 'AAA', url: 'https://www.instagram.com/p/AAA/', type: 'post', username: 'alice', addedAt: 1, lists: ['l1'] },
};

async function popup(context, extensionId) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.evaluate(async (d) => { await chrome.storage.local.clear(); await chrome.storage.local.set(d); }, DATA);
  await page.reload();
  let asked = false;
  page.on('dialog', (d) => { asked = true; d.dismiss(); });
  return { page, asked: () => asked };
}
const stored = (page, key) => page.evaluate((k) => chrome.storage.local.get(k).then((r) => r[k] ?? null), key);

test('removing a post in the popup asks nothing and can be undone', async ({ context, extensionId }) => {
  const { page, asked } = await popup(context, extensionId);
  await page.click('.tab[data-tab="media"]');
  await page.locator('.card .icon-btn.remove').click();
  await expect(page.locator('#undo span')).toHaveText('Removed from KeepKeep');
  await page.screenshot({ path: test.info().outputPath('undo.png') });
  expect(await stored(page, 'm:AAA')).toBeNull();
  await page.locator('#undo button').click();
  await expect(page.locator('#undo')).toBeHidden();
  expect(await stored(page, 'm:AAA')).toEqual(DATA['m:AAA']);
  expect(asked()).toBe(false);
});

test('removing a profile in the popup asks nothing and can be undone, with its lists', async ({ context, extensionId }) => {
  const { page, asked } = await popup(context, extensionId);
  await page.click('.tab[data-tab="profiles"]');
  await page.locator('#profiles li .icon-btn.remove').click();
  await expect(page.locator('#undo span')).toHaveText('Removed @alice');
  expect(await stored(page, 'p:alice')).toBeNull();
  expect(await stored(page, 'm:AAA')).not.toBeNull(); // their media stays
  await page.locator('#undo button').click();
  expect(await stored(page, 'p:alice')).toEqual(DATA['p:alice']);
  expect(asked()).toBe(false);
});
