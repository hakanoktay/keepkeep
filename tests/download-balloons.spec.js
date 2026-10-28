// The download card (panel.js): one card for all downloads; the files sit on a
// reel behind a fixed window of three rows that slides up as files finish
// ("✓ n of N saved" above, "+n more" below); a button under it stays clickable.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('./fixtures');

const src = (f) => fs.readFileSync(path.join(__dirname, '..', 'extension', f), 'utf8');

async function balloons(context, extensionId, n) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto(`chrome-extension://${extensionId}/offscreen.html`);
  await page.evaluate(src('basket.js') + src('panel.js') + ';window.KeepKeepPanel = KeepKeepPanel;');
  // A page button right under where the balloons sit (top right).
  await page.evaluate(() => {
    // One of KeepKeep's own buttons on the page (they carry data-keepkeep), and a plain page link.
    const b = Object.assign(document.createElement('button'), { id: 'under', textContent: 'Under' });
    b.dataset.keepkeep = 'action';
    const a = Object.assign(document.createElement('a'), { href: '#x', textContent: 'A page link' });
    Object.assign(a.style, { position: 'fixed', top: '60px', right: '40px', width: '120px', height: '30px', display: 'block' });
    document.body.append(a);
    Object.assign(b.style, { position: 'fixed', top: '120px', right: '40px', width: '120px', height: '40px' });
    b.onclick = () => { window.clicked = (window.clicked || 0) + 1; };
    document.body.append(b);
  });
  await page.evaluate((n) => {
    const d = KeepKeepPanel.downloads;
    d.start('j');
    d.items('j', { username: 'alexijayyy', files: Array.from({ length: n }, (_, i) => ({ filename: `a_${i + 1}.jpg`, kind: 'image' })) });
  }, n);
  const root = (sel) => page.locator('#keepkeep-downloads').locator(sel);
  return { page, root };
}

const visibleNames = (root) => root('.bubble.item:not(.away) .name').allTextContents();

test('many files: the one downloading and the next two show, the rest wait in "+n more"; the card does not grow', async ({ context, extensionId }) => {
  const { page, root } = await balloons(context, extensionId, 12);
  await page.waitForTimeout(400);
  expect(await visibleNames(root)).toEqual(['a_1.jpg', 'a_2.jpg', 'a_3.jpg']);
  await expect(root('.sumrow.more')).toHaveText('+9 more');
  await expect(root('.sumrow.saved')).toHaveText('0 of 12 saved');
  expect(await root('.items').evaluate((l) => l.scrollHeight <= l.clientHeight)).toBe(true);
});

test('finished files slide up into "✓ n of N saved"; the card keeps its size', async ({ context, extensionId }) => {
  const { page, root } = await balloons(context, extensionId, 12);
  await page.waitForTimeout(500);
  const h0 = (await root('.job').boundingBox()).height;
  await page.evaluate(() => { for (let i = 0; i < 3; i++) KeepKeepPanel.downloads.progress('j', i, 100, 100, true); });
  await expect(root('.sumrow.saved')).toHaveText('3 of 12 saved');
  expect(await visibleNames(root)).toEqual(['a_4.jpg', 'a_5.jpg', 'a_6.jpg']);
  await expect(root('.sumrow.more')).toHaveText('+6 more');
  await page.waitForTimeout(600);
  const h1 = (await root('.job').boundingBox()).height;
  expect(Math.abs(h1 - h0)).toBeLessThan(1);
  expect(await root('.items').evaluate((l) => l.scrollHeight <= l.clientHeight)).toBe(true);
});

test('at the end: "✓ n of N saved", the last files in the window, nothing more', async ({ context, extensionId }) => {
  const { page, root } = await balloons(context, extensionId, 6);
  await page.evaluate(() => KeepKeepPanel.downloads.finish('j', { filenames: Array.from({ length: 6 }, (_, i) => `a_${i + 1}.jpg`) }));
  await expect(root('.sumrow.saved')).toHaveText('6 of 6 saved');
  expect(await visibleNames(root)).toEqual(['a_4.jpg', 'a_5.jpg', 'a_6.jpg']);
  await expect(root('.sumrow.more')).toHaveText('');
});

test('a button under the balloons: they fade and the click goes through', async ({ context, extensionId }) => {
  const { page, root } = await balloons(context, extensionId, 7);
  await page.waitForTimeout(800);
  await page.mouse.move(1100, 140); // over the balloons and the page button under them
  await expect(root('.stack')).toHaveClass(/through/);
  await page.mouse.click(1100, 140);
  expect(await page.evaluate(() => window.clicked)).toBe(1);
  await page.mouse.move(600, 600); // away
  await expect(root('.stack')).not.toHaveClass(/through/);
});

test('over the card with a page link (not a KeepKeep button) under it, it stays solid', async ({ context, extensionId }) => {
  const { page, root } = await balloons(context, extensionId, 7);
  await page.waitForTimeout(800);
  await page.mouse.move(1100, 75); // the page link under the card
  await page.waitForTimeout(150);
  await expect(root('.stack')).not.toHaveClass(/through/);
});

test('several posts: one card, "Downloading 2 posts", their files in one list', async ({ context, extensionId }) => {
  const { page, root } = await balloons(context, extensionId, 3);
  await page.evaluate(() => {
    const d = KeepKeepPanel.downloads;
    d.start('k');
    d.items('k', { username: 'bob', files: [{ filename: 'b_1.mp4', kind: 'video' }, { filename: 'b_2.jpg', kind: 'image' }] });
  });
  await expect(root('.job')).toHaveCount(1);
  await expect(root('.header .name')).toHaveText('Downloading 2 posts');
  await expect(root('.header .sub')).toHaveText('5 files');
  await page.evaluate(() => KeepKeepPanel.downloads.finish('j', {}));
  await expect(root('.header .name')).toHaveText('Downloading 2 posts'); // bob's still going
  await page.evaluate(() => KeepKeepPanel.downloads.finish('k', {}));
  await expect(root('.header .name')).toHaveText('Saved to Downloads/KeepKeep');
  await expect(root('.header .sub')).toHaveText('5 files');
});

test('the card keeps its size while files finish (no growing downwards)', async ({ context, extensionId }) => {
  const { page, root } = await balloons(context, extensionId, 12);
  await page.evaluate(() => KeepKeepPanel.downloads.progress('j', 0, 100, 100, true));
  await page.waitForTimeout(600); // card settled
  const h0 = (await root('.job').boundingBox()).height;
  for (let i = 1; i < 8; i++) {
    await page.evaluate((i) => KeepKeepPanel.downloads.progress('j', i, 100, 100, true), i);
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(600);
  const h1 = (await root('.job').boundingBox()).height;
  expect(Math.abs(h1 - h0)).toBeLessThan(1);
});

test('files keep their order: a row never jumps to another place', async ({ context, extensionId }) => {
  const { page, root } = await balloons(context, extensionId, 8);
  const order = () => root('.reel .item .name').allTextContents();
  const first = await order();
  await page.evaluate(() => { const d = KeepKeepPanel.downloads; d.progress('j', 1, 100, 100, true); d.progress('j', 0, 50, 100, false); d.progress('j', 0, 100, 100, true); });
  expect(await order()).toEqual(first);
  expect(await visibleNames(root)).toEqual(['a_3.jpg', 'a_4.jpg', 'a_5.jpg']);
});

test('files finishing at once (already in the cache) never make the card grow', async ({ context, extensionId }) => {
  const { page, root } = await balloons(context, extensionId, 20);
  await page.waitForTimeout(500);
  const h0 = (await root('.job').boundingBox()).height;
  const heights = await page.evaluate(async () => {
    const d = KeepKeepPanel.downloads;
    const card = document.querySelector('#keepkeep-downloads').shadowRoot.querySelector('.job');
    const hs = [];
    for (let i = 0; i < 12; i++) { d.progress('j', i, 100, 100, true); hs.push(card.getBoundingClientRect().height); await new Promise((r) => setTimeout(r, 20)); }
    return hs;
  });
  for (const h of heights) expect(Math.abs(h - h0)).toBeLessThan(1);
});

test('minimise: the files fold away, the header says how far the download is; again shows them', async ({ context, extensionId }) => {
  const { page, root } = await balloons(context, extensionId, 7);
  await page.waitForTimeout(700);
  await page.evaluate(() => { for (let i = 0; i < 3; i++) KeepKeepPanel.downloads.progress('j', i, 100, 100, true); });
  await root('.header .min').click();
  await expect(root('.job')).toHaveClass(/collapsed/);
  await expect(root('.header .sub')).toHaveText(/^3 of 7 saved · \d+%$/);
  await page.evaluate(() => KeepKeepPanel.downloads.progress('j', 3, 100, 100, true));
  await expect(root('.header .sub')).toHaveText(/^4 of 7 saved/);
  await root('.header .min').click();
  await expect(root('.job')).not.toHaveClass(/collapsed/);
  await expect(root('.header .sub')).toHaveText('@alexijayyy');
});

test('a single file has the minimise button too', async ({ context, extensionId }) => {
  const { root } = await balloons(context, extensionId, 1);
  await expect(root('.min')).toHaveCount(1);
});

test('the list scrolls by hand: it stops following, the page stays, it comes back', async ({ context, extensionId }) => {
  const { page, root } = await balloons(context, extensionId, 12);
  await page.evaluate(() => { document.body.style.height = '3000px'; });
  await page.waitForTimeout(500);
  const box = await root('.track').boundingBox();
  await page.mouse.move(box.x + 100, box.y + 60);
  await page.mouse.wheel(0, 200);
  await expect.poll(() => root('.track').evaluate((t) => t.scrollTop)).toBeGreaterThan(100);
  expect(await page.evaluate(() => scrollY)).toBe(0); // the page under it didn't scroll
  await expect(root('.sumrow.more')).toHaveText('Back to current');
  // A file finishing doesn't pull the list away from where the user looks.
  const top = await root('.track').evaluate((t) => t.scrollTop);
  await page.evaluate(() => KeepKeepPanel.downloads.progress('j', 0, 100, 100, true));
  await page.waitForTimeout(600);
  expect(await root('.track').evaluate((t) => t.scrollTop)).toBe(top);
  // "Back to current": to the file downloading.
  await root('.sumrow.more').click();
  await expect.poll(() => root('.track').evaluate((t) => t.scrollTop)).toBe(52);
  await expect(root('.sumrow.more')).toHaveText('+8 more');
});

test('after scrolling by hand, leaving the card brings the list back to the current file', async ({ context, extensionId }) => {
  const { page, root } = await balloons(context, extensionId, 12);
  await page.waitForTimeout(500);
  const box = await root('.track').boundingBox();
  await page.mouse.move(box.x + 100, box.y + 60);
  await page.mouse.wheel(0, 300);
  await expect.poll(() => root('.track').evaluate((t) => t.scrollTop)).toBeGreaterThan(100);
  await page.mouse.move(100, 600);
  await expect.poll(() => root('.track').evaluate((t) => t.scrollTop), { timeout: 4000 }).toBe(0);
  await expect(root('.sumrow.more')).toHaveText('+9 more');
});
