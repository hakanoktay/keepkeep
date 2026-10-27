// The download card (panel.js): one card per download; the smart list never
// scrolls (finished files fold into "✓ n saved", the one downloading and the
// next two show, the rest wait in "+n more"); a button under it stays clickable.
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

const visibleNames = (root) => root('.bubble.item:not(.gone) .name').allTextContents();

test('many files: the one downloading and the next two show, the rest wait in "+n more"; no scrolling', async ({ context, extensionId }) => {
  const { page, root } = await balloons(context, extensionId, 12);
  await page.waitForTimeout(400);
  expect(await visibleNames(root)).toEqual(['a_1.jpg', 'a_2.jpg', 'a_3.jpg']);
  await expect(root('.sumrow.more')).toHaveText('+9 more');
  await expect(root('.sumrow.saved')).toBeHidden();
  expect(await root('.items').evaluate((l) => l.scrollHeight <= l.clientHeight)).toBe(true);
});

test('finished files fold into "✓ n saved"; the list moves up and keeps its size', async ({ context, extensionId }) => {
  const { page, root } = await balloons(context, extensionId, 12);
  await page.waitForTimeout(400);
  const h0 = (await root('.job').boundingBox()).height;
  await page.evaluate(() => { for (let i = 0; i < 3; i++) KeepKeepPanel.downloads.progress('j', i, 100, 100, true); });
  // Just finished: still seen with its ✓ for a moment…
  expect(await visibleNames(root)).toContain('a_1.jpg');
  // …then folded away.
  await expect(root('.sumrow.saved')).toHaveText('3 saved');
  await expect.poll(() => visibleNames(root)).toEqual(['a_4.jpg', 'a_5.jpg', 'a_6.jpg']);
  await expect(root('.sumrow.more')).toHaveText('+6 more');
  const h1 = (await root('.job').boundingBox()).height;
  expect(Math.abs(h1 - h0)).toBeLessThan(50); // the "✓ n saved" row, nothing else
  expect(await root('.items').evaluate((l) => l.scrollHeight <= l.clientHeight)).toBe(true);
});

test('at the end: "✓ n saved" and no "more" row', async ({ context, extensionId }) => {
  const { page, root } = await balloons(context, extensionId, 6);
  await page.evaluate(() => KeepKeepPanel.downloads.finish('j', { filenames: Array.from({ length: 6 }, (_, i) => `a_${i + 1}.jpg`) }));
  await expect(root('.sumrow.saved')).toHaveText('6 saved');
  await expect(root('.sumrow.more')).toBeHidden();
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
  await page.waitForTimeout(1600); // "✓ 1 saved" row in, card settled
  const h0 = (await root('.job').boundingBox()).height;
  for (let i = 1; i < 8; i++) {
    await page.evaluate((i) => KeepKeepPanel.downloads.progress('j', i, 100, 100, true), i);
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(1600);
  const h1 = (await root('.job').boundingBox()).height;
  expect(Math.abs(h1 - h0)).toBeLessThan(2);
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
