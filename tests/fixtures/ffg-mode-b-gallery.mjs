import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import sharp from 'sharp';

// Collected by the native validation config only. Requires the isolated
// docker-compose.test.yml FFG application and its completed seed job.
const base = 'http://127.0.0.1:4000';
const photoRows = page => page.locator('[data-gallery-items] > li');
const publishResponse = page => page.waitForResponse(response =>
    response.request().method() === 'POST' && response.url().includes('/dashboard/posts/'));
const draftSave = async page => {
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.locator('[data-gallery-status]')).toHaveText('Private draft saved.');
};

test('FFG documentary gallery publishes 65 and 100 photos through isolated Mode B', async ({ page, context, request }) => {
    test.setTimeout(180000);
    await context.route(/^https?:\/\/(?!127\.0\.0\.1:4000\/)/, route => route.abort());
    const slug = `mode-b-documentary-${Date.now().toString(36)}`;
    const title = slug.replaceAll('-', ' ');
    const originalBase = await mkdtemp(path.join(tmpdir(), 'ffg-mode-b-gallery-'));
    try {
        await page.goto(base + '/login');
        await page.getByLabel('Username').fill('mode-b-multer-admin');
        await page.getByLabel('Password').fill('ModeB-Multer-Synthetic-Only-2026');
        await Promise.all([page.waitForURL('**/admin/dashboard'), page.getByRole('button', { name: 'Login' }).click()]);
        await page.goto(base + '/admin/posts/new');
        await expect(page.locator('[data-gallery-files]')).toBeEnabled();
        await page.locator('#title').fill(title);
        await page.locator('#created_at').fill('2026-10-02');
        await page.locator('#public-author-1').selectOption({ label: 'Mode B Author One' });
        await page.locator('#publisherId').selectOption({ label: 'Mode B Author One' });
        await page.locator('#body').fill('<p>Before the gallery.</p>\n<p>After the gallery.</p>');
        await page.locator('#body').evaluate(area => {
            const offset = area.value.indexOf('\n') + 1;
            area.focus();
            area.setSelectionRange(offset, offset);
        });
        await page.getByRole('button', { name: /Insert gallery marker/ }).click();

        const upload = async (first, end) => {
            const files = [];
            for (let i = first; i < end; i++) {
                const file = path.join(originalBase, `synthetic-photo-${i + 1}.jpg`);
                const image = sharp({ create: { width: i % 2 ? 640 : 960, height: i % 2 ? 960 : 640,
                    channels: 3, background: { r: i * 2, g: 110, b: 75 } } }).jpeg();
                if (i === 0) image.withMetadata({ orientation: 6 });
                await image.toFile(file);
                files.push(file);
            }
            await page.locator('[data-gallery-files]').setInputFiles(files);
            await expect(photoRows(page)).toHaveCount(end, { timeout: 90000 });
            await expect(page.locator('[data-gallery-files]')).toBeEnabled();
            for (let i = first; i < end; i++) await photoRows(page).nth(i).locator('[data-gallery-alt]').fill(`Synthetic photo ${i + 1}`);
        };
        await upload(0, 65);
        await photoRows(page).first().locator('[data-gallery-caption]').fill('Synthetic first caption');
        await photoRows(page).first().getByRole('button', { name: /Move down/ }).click();
        await draftSave(page);
        const editUrl = page.url();
        await page.reload();
        await expect(photoRows(page)).toHaveCount(65);
        await expect(photoRows(page).nth(1).locator('[data-gallery-caption]')).toHaveValue('Synthetic first caption');

        const stale = await context.newPage();
        await stale.goto(editUrl);
        await expect(photoRows(stale)).toHaveCount(65);
        await page.locator('#body').fill('<p>Before the gallery.</p>\n<div data-body-gallery></div>\n<p>After the gallery.</p>\n<p>Saved later.</p>');
        await draftSave(page);
        const [rejected] = await Promise.all([publishResponse(stale), stale.getByRole('button', { name: 'Save draft' }).click()]);
        expect(rejected.status()).toBe(409);
        await stale.close();

        const id = await photoRows(page).first().getAttribute('data-id');
        const medium = `/uploads/m1-${id}-medium.webp`;
        const privatelyDenied = await request.head(base + medium, { headers: { 'If-None-Match': '*' } });
        expect(privatelyDenied.status()).toBe(404);
        expect(privatelyDenied.headers()['cache-control']).toBe('no-store');
        const [previewSaved] = await Promise.all([publishResponse(page), page.getByRole('button', { name: 'Preview article' }).click()]);
        expect(previewSaved.status()).toBe(200);
        await page.waitForURL('**/preview');
        await expect(page.locator('.documentary-gallery figure')).toHaveCount(65);
        await page.getByRole('link', { name: 'Return to editor' }).click();
        await expect(photoRows(page)).toHaveCount(65);
        await Promise.all([page.waitForURL('**/admin/dashboard'), page.getByRole('button', { name: 'Publish post' }).click()]);

        const edit = page.locator('tr').filter({ hasText: title }).locator('sl-button[href*="/edit"]');
        const editPath = await edit.getAttribute('href');
        expect(editPath).toBeTruthy();
        const article = base + '/post/' + slug;
        await page.setViewportSize({ width: 390, height: 780 });
        await page.goto(article);
        await expect(page.locator('.documentary-gallery figure')).toHaveCount(65);
        const first = page.locator('.documentary-gallery a').first();
        await expect(first).toHaveAccessibleName('Synthetic photo 2');
        await expect(first.locator('img')).toHaveAttribute('loading', 'lazy');
        expect(await page.locator('.documentary-gallery').evaluate(el => el.getBoundingClientRect().right <= innerWidth)).toBe(true);
        const served = await request.get(base + medium);
        expect(served.status()).toBe(200);
        expect((await request.head(base + medium)).status()).toBe(200);
        expect((await request.get(base + medium, { headers: { 'If-None-Match': served.headers().etag } })).status()).toBe(304);
        await first.focus();
        await Promise.all([page.waitForURL(`**/m1-${id}-large.webp`), first.press('Enter')]);

        await page.goto(new URL(editPath, base).href);
        await expect(photoRows(page)).toHaveCount(65);
        await upload(65, 100);
        const tooMany = await page.evaluate(async () => {
            const form = document.querySelector('.post-form'), data = new FormData(form);
            const selected = JSON.parse(data.get('bodyGalleryItems'));
            data.set('bodyGalleryItems', JSON.stringify([...selected, selected[0]]));
            data.set('submitIntent', 'draft');
            data.delete('image');
            return (await fetch(form.action, { method: 'POST', body: data })).status;
        });
        expect(tooMany).toBe(400);
        await Promise.all([page.waitForURL('**/admin/dashboard'), page.getByRole('button', { name: 'Publish update' }).click()]);
        await page.goto(article);
        await expect(page.locator('.documentary-gallery figure')).toHaveCount(100);
    } finally {
        await rm(originalBase, { recursive: true, force: true });
    }
});
