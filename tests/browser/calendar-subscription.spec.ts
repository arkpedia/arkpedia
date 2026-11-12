import { expect, test } from '@playwright/test';

for (const theme of ['dark', 'light']) {
  test(`calendar subscription and download in ${theme}`, async ({ page, request }, info) => {
    await page.addInitScript(theme => localStorage.setItem('theme', theme), theme);
    await page.goto('/schedule?view=calendar');
    const trigger = page.getByRole('button', { name: 'Sync calendar / .ics', exact: true });
    await trigger.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Sync calendar', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('[Confirmed]', { exact: true })).toBeVisible();
    await expect(dialog.getByText('[Predicted] … (CN estimate)', { exact: true })).toBeVisible();
    const url = dialog.getByRole('textbox', { name: 'Subscription URL', exact: true });
    const original = await url.inputValue();
    await expect(dialog.getByRole('link', { name: /Subscribe in calendar app/ })).toHaveAttribute('href', original.replace(/^https?:/, 'webcal:'));
    await dialog.getByRole('checkbox', { name: 'Include predicted dates' }).uncheck();
    await dialog.getByRole('checkbox', { name: 'Include operator birthdays' }).check();
    const selected = await url.inputValue();
    expect(selected).toContain('predicted=0&birthdays=1');
    const response = await request.get(selected);
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toContain('text/calendar');
    const body = (await response.text()).replace(/\r\n /g, '');
    expect(body).toContain('BEGIN:VCALENDAR');
    expect(body).toContain('[Confirmed]');
    expect(body).not.toContain('[Predicted]');
    expect(body).toContain('RRULE:FREQ=YEARLY');
    const cached = await request.get(selected, { headers: { 'If-None-Match': response.headers().etag } });
    expect(cached.status()).toBe(304);
    const head = await request.head(selected);
    expect(head.status()).toBe(200);
    expect(await head.body()).toHaveLength(0);
    const download = await request.get((await dialog.getByRole('link', { name: 'Download .ics', exact: true }).getAttribute('href'))!);
    expect(download.headers()['content-disposition']).toContain('attachment; filename="arkpedia-en.ics"');
    for (const width of info.project.name === 'mobile' ? [320, 390] : [820, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      const overflow = await dialog.evaluate(el => {
        const body = el.querySelector('.account-dialog-body')!;
        return body.scrollWidth - body.clientWidth;
      });
      expect(overflow).toBeLessThanOrEqual(1);
    }
    await page.screenshot({ path: info.outputPath(`calendar-${theme}.png`), scale: 'css' });
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect((await request.get('/api/calendar.ics?server=invalid')).status()).toBe(400);
    expect((await request.post('/api/calendar.ics')).status()).toBe(405);
  });
}
