// Albums: Download saves every item; Shift-click or D saves only the one on screen,
// under the name it has in the full download.
const { test, expect } = require('./fixtures');

const img = (n) => ({ image_versions2: { candidates: [
  { url: `https://scontent.cdninstagram.com/v/t51/${n}.jpg?stp=dst-jpg_e35_p1080x1080`, width: 1080, height: 1080 },
  { url: `https://scontent.cdninstagram.com/v/t51/${n}.jpg?stp=dst-jpg_e35_p640x640`, width: 640, height: 640 }] } });
const ALBUM = { items: [{
  media_type: 8, taken_at: 1719323002, user: { username: 'alice' }, ...img('B1'),
  carousel_media: [{ media_type: 1, ...img('B1') }, { media_type: 1, ...img('B2') },
    { media_type: 2, ...img('V3'), video_versions: [{ url: 'https://scontent.cdninstagram.com/v/t50/V3.mp4', width: 720, height: 720 }] }],
}] };

async function openAlbum(context, url = 'https://www.instagram.com/?page=album') {
  await context.route(/\/api\/v1\/media\/\d+\/info\//, (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(ALBUM) }));
  const page = await context.newPage();
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.goto(url);
  const download = page.locator('[data-keepkeep="action-group"] button').nth(2);
  await expect(download).toBeVisible({ timeout: 5000 });
  return { page, download, names: page.locator('#keepkeep-downloads .bubble.item .name') };
}

test('Download saves every item of the album', async ({ context }) => {
  const { download, names } = await openAlbum(context);
  await download.click();
  await expect(names).toHaveCount(3);
});

test('Shift-click saves only the photo on screen, named as in the full download', async ({ context }) => {
  const { download, names } = await openAlbum(context);
  await download.click({ modifiers: ['Shift'] });
  await expect(names).toHaveText([/^alice_\d{10}_2\.jpg$/]);
});

test('D over the post saves the video on screen (found by the album dots)', async ({ context }) => {
  const { page, names } = await openAlbum(context);
  await page.evaluate(() => showItem(2));
  await page.mouse.move(500, 300);
  await page.keyboard.press('d');
  await expect(names).toHaveText([/^alice_\d{10}_3\.mp4$/]);
});

// The post's own page: the album sits outside the action bar's panel and has no
// aria-current dots; the address says which item is shown (?img_index=n).
const POST = 'https://www.instagram.com/p/ALB1/';
test('post page: Shift-click saves the item named by ?img_index', async ({ context }) => {
  const { download, names } = await openAlbum(context, `${POST}?img_index=2&page=album-post`);
  await download.click({ modifiers: ['Shift'] });
  await expect(names).toHaveText([/^alice_\d{10}_2\.jpg$/]);
});

test('post page without img_index: the first item', async ({ context }) => {
  const { download, names } = await openAlbum(context, `${POST}?page=album-post`);
  await download.click({ modifiers: ['Shift'] });
  await expect(names).toHaveText([/^alice_\d{10}_1\.jpg$/]);
});

test('post page: D works wherever the pointer is', async ({ context }) => {
  const { page, names } = await openAlbum(context, `${POST}?img_index=3&page=album-post`);
  await page.mouse.move(250, 250); // over the album, outside the post's panel
  await page.keyboard.press('d');
  await expect(names).toHaveText([/^alice_\d{10}_3\.mp4$/]);
});
