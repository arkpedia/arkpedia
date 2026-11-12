import { expect, test, type Page } from '@playwright/test';
import { stubMonsterSiren } from './monster-siren-stub';
import { stubYouTube } from './youtube-stub';

function wavTone(hz: number) {
  const rate = 16000;
  const length = rate * 30;
  const wav = Buffer.alloc(44 + length);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate, 28); wav.writeUInt16LE(1, 32);
  wav.writeUInt16LE(8, 34); wav.write('data', 36); wav.writeUInt32LE(length, 40);
  for (let i = 0; i < length; i++) wav[44 + i] = 128 + Math.round(12 * Math.sin(i * hz * 2 * Math.PI / rate));
  return wav;
}

// Observe real connections to the speaker. Reading element.muted or the visualizer's
// own analyser would miss a second deck still routed through Web Audio on an iPhone.
async function monitorSpeaker(page: Page) {
  await page.addInitScript(() => {
    Reflect.deleteProperty(HTMLMediaElement.prototype, 'captureStream');
    const speakers = new Set<AudioNode>();
    const inputs = new Map<AudioNode, Set<AudioNode>>();
    const meters = new WeakMap<AudioNode, AnalyserNode>();
    let maxConnections = 0;
    const prototype = AudioNode.prototype;
    for (const method of ['connect', 'disconnect'] as const) {
      Reflect.set(prototype, method, new Proxy(prototype[method], {
        apply(original, source: AudioNode, args) {
          const result = Reflect.apply(original, source, args);
          if (method === 'connect' && args[0] instanceof AudioNode) {
            if (!inputs.has(args[0])) inputs.set(args[0], new Set());
            inputs.get(args[0])!.add(source);
          } else if (method === 'disconnect') {
            if (!args.length) inputs.forEach(nodes => nodes.delete(source));
            else if (args[0] instanceof AudioNode) inputs.get(args[0])?.delete(source);
          }
          if (args[0] === source.context.destination) {
            if (method === 'connect') {
              speakers.add(source);
              if (!meters.has(source)) {
                const meter = source.context.createAnalyser();
                source.connect(meter);
                meters.set(source, meter);
              }
            }
            else speakers.delete(source);
          }
          if (method === 'disconnect' && !args.length) speakers.delete(source);
          maxConnections = Math.max(maxConnections, speakers.size);
          return result;
        },
      }));
    }
    const audibleElements = (node: AudioNode): HTMLMediaElement[] => {
      if (node instanceof GainNode && node.gain.value === 0) return [];
      if (node instanceof MediaElementAudioSourceNode) return [node.mediaElement];
      return [...inputs.get(node) ?? []].flatMap(audibleElements);
    };
    Object.defineProperty(window, 'musicSpeakerState', { get: () => {
      const audible = [...speakers].flatMap(audibleElements);
      return {
        maxConnections, count: speakers.size,
        activeOnly: audible.length === 1 && audible[0] === document.querySelector('audio[data-music-audio]') && !audible[0].muted,
      };
    } });
    Object.defineProperty(window, 'musicSpeakerRms', { get: () => {
      const meter = [...speakers].map(source => meters.get(source))[0];
      if (!meter) return 0;
      const samples = new Float32Array(meter.fftSize);
      meter.getFloatTimeDomainData(samples);
      return Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
    } });
  });
}

for (const first of ['vocal', 'instrumental']) {
  test(`returning to the initial ${first} recording preserves its output level`, async ({ page }) => {
    await monitorSpeaker(page);
    await stubYouTube(page, 'allow', { dataSaver: false });
    await stubMonsterSiren(page);
    // Identical files make an output-level change distinguishable from mastering differences.
    const tone = wavTone(440);
    await page.route(/\/api\/music-audio\/(779468|048776)(\?|$)/, route => route.fulfill({ contentType: 'audio/wav', body: tone }));
    await page.goto('/music/discover?q=paper');
    await page.locator(`[data-song-id="${first === 'vocal' ? '2Qul6EjQmYc' : 'klxYxU_4c-k'}"] .music-song-row-main`).first().click();
    const bar = page.getByRole('region', { name: 'Player', exact: true });
    await bar.getByRole('link', { name: /Open Now playing/ }).click();
    const rms = () => page.evaluate(() => Number(Reflect.get(window, 'musicSpeakerRms')));
    // Wait for a full analyser window, rather than sampling its initial partial buffer.
    const expected = 12 / 128 / Math.sqrt(2) * 0.5;
    await expect.poll(rms).toBeCloseTo(expected, 2);
    await expect(page.locator('audio[data-music-audio]')).toHaveJSProperty('volume', 1);
    for (let turn = 0; turn < 6; turn++) {
      const next = turn % 2 === 0 ? (first === 'vocal' ? 'instrumental' : 'vocal') : first;
      await test.step(`switch ${turn + 1}: ${next}`, async () => {
        await page.getByRole('button', { name: `Play ${next} version`, exact: true }).click();
        await expectOnlyActiveSpeaker(page);
        await expect.poll(rms).toBeCloseTo(expected, 2);
      });
    }
    // Hiding analysis must not change the sound, even during quick switches.
    await page.getByRole('button', { name: 'Switch to original waves' }).click();
    for (let turn = 0; turn < 4; turn++) {
      const next = turn % 2 === 0 ? (first === 'vocal' ? 'instrumental' : 'vocal') : first;
      await page.getByRole('button', { name: `Play ${next} version`, exact: true }).click();
    }
    await expectOnlyActiveSpeaker(page);
    await expect.poll(rms).toBeCloseTo(expected, 2);
    await page.getByRole('button', { name: 'Switch to frequency spectrum' }).click();
    await expect.poll(rms).toBeCloseTo(expected, 2);
  });
}

async function expectOnlyActiveSpeaker(page: Page) {
  await expect.poll(() => page.evaluate(() => Reflect.get(window, 'musicSpeakerState'))).toEqual({ activeOnly: true, maxConnections: 1, count: 1 });
}

for (const delayed of [false, true]) {
  test(`spectrum and speakers follow only the active recording (${delayed ? 'slow' : 'ready'} alternate)`, async ({ page }) => {
    await monitorSpeaker(page);
    await stubYouTube(page, 'allow', { dataSaver: false });
    await stubMonsterSiren(page);
    const vocal = wavTone(167);
    const instrumental = wavTone(1060);
    let allowVocal!: () => void;
    const vocalReady = new Promise<void>(resolve => { allowVocal = resolve; });
    await page.route(/\/api\/music-audio\/(779468|048776)(\?|$)/, async route => {
      const isVocal = route.request().url().includes('779468');
      if (isVocal && delayed) await vocalReady;
      await route.fulfill({ contentType: 'audio/wav', body: isVocal ? vocal : instrumental });
    });
    await page.goto('/music/discover?q=paper');
    await page.locator('[data-song-id="klxYxU_4c-k"] .music-song-row-main').first().click();
    const bar = page.getByRole('region', { name: 'Player', exact: true });
    await bar.getByRole('link', { name: /Open Now playing/ }).click();
    const trace = page.locator('.music-wave-svg[data-live] .music-wave-live');
    const peakBand = () => trace.evaluate(path => {
      const levels = Array.from((path.getAttribute('d') || '').matchAll(/v-([\d.]+)/g), match => Number(match[1]));
      return Math.max(...levels) > 5 ? levels.indexOf(Math.max(...levels)) : -1;
    });
    await expect.poll(peakBand).toBe(24);
    await expectOnlyActiveSpeaker(page);
    const standby = await page.locator('audio[data-music-standby]').elementHandle();
    await page.getByRole('button', { name: 'Play vocal version', exact: true }).click();
    expect(await standby!.evaluate(el => el.hasAttribute('data-music-audio'))).toBe(true);
    if (delayed) {
      // Pause while the selected file is still in flight. A late response must
      // never reopen the speaker or resume either decoder.
      await bar.locator('.music-play-btn:visible').click();
      const paused = () => page.evaluate(() => ({
        playingDecks: Array.from(document.querySelectorAll('audio[data-music-audio],audio[data-music-standby]')).filter(el => !(el as HTMLAudioElement).paused).length,
        speakers: Reflect.get(window, 'musicSpeakerState').count,
      }));
      await expect.poll(paused).toEqual({ playingDecks: 0, speakers: 0 });
      allowVocal();
      await page.waitForFunction(() => (document.querySelector('audio[data-music-audio]') as HTMLAudioElement)?.readyState >= 1);
      await expect(bar.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
      expect(await paused()).toEqual({ playingDecks: 0, speakers: 0 });
      await bar.getByRole('button', { name: 'Play', exact: true }).click();
    }
    await expect.poll(peakBand).toBe(8);
    await expectOnlyActiveSpeaker(page);
    await page.getByRole('button', { name: 'Switch to original waves' }).click();
    await page.getByRole('button', { name: 'Switch to frequency spectrum' }).click();
    await expect.poll(peakBand).toBe(8);
    await expectOnlyActiveSpeaker(page);
    await bar.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect(trace).toHaveCount(0);
    await bar.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(peakBand).toBe(8);
    await expectOnlyActiveSpeaker(page);
    await page.getByRole('button', { name: 'Play instrumental version', exact: true }).click();
    await expect.poll(peakBand).toBe(24);
    await expectOnlyActiveSpeaker(page);
  });
}
