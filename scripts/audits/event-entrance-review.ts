/** Browser entry for the local, data-only native pack reviewer. */
import { loadGameUiPlayer } from '../../lib/events/gameUiPlayer';

const canvas = document.querySelector<HTMLCanvasElement>('canvas')!;
const timeline = document.querySelector<HTMLInputElement>('#timeline')!;
const play = document.querySelector<HTMLButtonElement>('#play')!;
const status = document.querySelector<HTMLOutputElement>('output')!;
const manifest: { packs: { folder: string }[] } = await fetch('/manifest.json').then(r => r.json());
const selector = document.querySelector<HTMLSelectElement>('select')!;
for (const pack of manifest.packs) selector.add(new Option(pack.folder, `/${pack.folder}/scene.json`));
const scene = new URL(location.href).searchParams.get('scene') ?? selector.value;
selector.value = scene;
selector.onchange = () => { location.search = new URLSearchParams({ scene: selector.value }).toString(); };
try {
  const player = await loadGameUiPlayer(canvas, new URL(scene, location.origin).href, new AbortController().signal);
  let raf = 0, began = 0;
  timeline.max = String(player.scene.duration);
  const draw = (time: number) => {
    player.draw(time); timeline.value = String(time); status.value = `${time.toFixed(3)} / ${player.scene.duration.toFixed(3)}s`;
  };
  timeline.oninput = () => { cancelAnimationFrame(raf); play.textContent = 'Play from start'; draw(Number(timeline.value)); };
  play.onclick = () => {
    cancelAnimationFrame(raf); began = performance.now(); play.textContent = 'Replay';
    const frame = (now: number) => {
      const time = Math.min((now - began) / 1000, player.scene.duration); draw(time);
      if (time < player.scene.duration) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  };
  // Fixed-size canvas and explicit frame control support repeatable GPU captures.
  Object.assign(window, { ready: true, player, draw }); draw(0);
  window.addEventListener('pagehide', () => { cancelAnimationFrame(raf); player.dispose(); }, { once: true });
} catch (error) { status.value = String(error); throw error; }
