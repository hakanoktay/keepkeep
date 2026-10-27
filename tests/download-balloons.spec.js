// The download balloons (panel.js): a post's files stay within about four
// balloons' height and scroll; the one downloading stays in view; a button
// under the balloons stays clickable.
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
    const b = Object.assign(document.createElement('button'), { id: 'under', textContent: 'Under' });
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

test('many files: the list stays about four balloons tall and scrolls', async ({ context, extensionId }) => {
  const { page, root } = await balloons(context, extensionId, 12);
  await page.waitForTimeout(800); // slide-in
  const box = await root('.items').boundingBox();
  expect(box.height).toBeLessThanOrEqual(260); // about four balloons, shadows included
  expect(await root('.items').evaluate((l) => l.scrollHeight > l.clientHeight)).toBe(true);
  await expect(root('.bubble.item')).toHaveCount(12);
});

test('the file being downloaded scrolls into view', async ({ context, extensionId }) => {
  const { page, root } = await balloons(context, extensionId, 12);
  await page.evaluate(() => KeepKeepPanel.downloads.progress('j', 9, 50, 100, false));
  const visible = await root('.items').evaluate((l) => {
    const b = l.children[9];
    return b.offsetTop - l.offsetTop >= l.scrollTop && b.offsetTop - l.offsetTop + b.offsetHeight <= l.scrollTop + l.clientHeight + 8;
  });
  expect(visible).toBe(true);
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

test('over balloons with nothing clickable under them, they stay solid', async ({ context, extensionId }) => {
  const { page, root } = await balloons(context, extensionId, 7);
  await page.waitForTimeout(800);
  await page.mouse.move(1100, 40); // the header balloon; nothing under it
  await page.waitForTimeout(100);
  await expect(root('.stack')).not.toHaveClass(/through/);
});

test('the list flows to its end and back once, to show there is more', async ({ context, extensionId }) => {
  const { page, root } = await balloons(context, extensionId, 12);
  const seen = await root('.items').evaluate(async (l) => {
    let max = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < 3500) { max = Math.max(max, l.scrollTop); await new Promise(requestAnimationFrame); }
    return { max, end: l.scrollTop, room: l.scrollHeight - l.clientHeight };
  });
  expect(seen.max).toBeGreaterThan(seen.room - 5); // reached the end
  expect(seen.end).toBe(0); // and came back
});

test('minimise: the files fold away, the header says how far the download is; again shows them', async ({ context, extensionId }) => {
  const { page, root } = await balloons(context, extensionId, 7);
  await page.waitForTimeout(700);
  await page.evaluate(() => { for (let i = 0; i < 3; i++) KeepKeepPanel.downloads.progress('j', i, 100, 100, true); });
  await root('.header .min').click();
  await expect(root('.listbox')).toHaveClass(/collapsed/);
  await expect(root('.header .sub')).toHaveText(/^3 of 7 saved · \d+%$/);
  await page.evaluate(() => KeepKeepPanel.downloads.progress('j', 3, 100, 100, true));
  await expect(root('.header .sub')).toHaveText(/^4 of 7 saved/);
  await root('.header .min').click();
  await expect(root('.listbox')).not.toHaveClass(/collapsed/);
  await expect(root('.header .sub')).toHaveText('@alexijayyy');
});

test('a single file has no minimise button', async ({ context, extensionId }) => {
  const { root } = await balloons(context, extensionId, 1);
  await expect(root('.min')).toHaveCount(0);
});
