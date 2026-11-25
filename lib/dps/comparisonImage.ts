import { buildConditions, buildLabel, burstThreshold, calculate, profile, type Build, type Target } from './calculator';
import { fallout, firstBurst } from './breakpoints';
import { damageBasis, dpsLabel } from './damageLabels';

export type ImageView = 'condensed' | 'detailed';
interface ExportOptions {
  view: ImageView;
  svg: SVGSVGElement;
  metric: string;
  probe: string;
  target: Target;
  targetName: string;
  healingView: boolean;
  series: { build: Build; value: string; colorToken: string }[];
  timeline: HTMLTableElement | null;
}

const width = 1080;
const inset = 36;
const inner = width - inset * 2;

const number = (n: number | null) =>
  n === null ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: 2 });
const seconds = (n: number | null) => (n === null ? '—' : number(n) + ' s');

// The live SVG already contains the sampled steps, gaps, zoom clipping and probe.
// Inline its theme paint before decoding it as an independent image.
function plotImage(svg: SVGSVGElement, chartHeight: number) {
  const copy = svg.cloneNode(true) as SVGSVGElement;
  const originals = svg.querySelectorAll('text,line,path,circle,rect');
  copy.querySelectorAll('text,line,path,circle,rect').forEach((el, i) => {
    const style = getComputedStyle(originals[i]);
    for (const prop of ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'font-size', 'font-family']) {
      el.setAttribute(prop, style.getPropertyValue(prop));
    }
  });
  copy.setAttribute('width', String(inner));
  copy.setAttribute('height', String(chartHeight));
  const image = new Image();
  image.src =
    'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(copy));
  return image;
}

function breakdown(b: Build, target: Target) {
  const r = calculate(b, target);
  const basis = damageBasis(r);
  const lines = [
    [
      number(r.sourceAtk) + ' source ATK',
      r.interval ? 'Repeats every ' + seconds(r.interval) : '',
    ]
      .filter(Boolean)
      .join(' · '),
  ];
  if (r.hps === null) {
    lines.push(
      [
        number(r.damage) + ' damage ' + basis,
        r.dps !== null && number(r.dps) + ' ' + dpsLabel([b]),
        r.element && number(r.injury) + ' injury ' + basis,
        (r.injuryRate ?? 0) > 0 && number(r.injuryRate) + ' injury per second',
      ].filter(Boolean).join(' · '),
      Object.entries(r.components)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => number(v) + ' ' + k + ' HP')
        .join('   ·   '),
    );
  }
  if (r.healing) {
    const { direct, regeneration, conditional, hps, note } = r.healing;
    if (direct) lines.push(number(direct.amount) + ' per heal · every ' + seconds(direct.interval)
      + ' · up to ' + direct.targets + (direct.targets === 1 ? ' ally' : ' allies'));
    if (regeneration) lines.push(number(regeneration) + ' regeneration per second');
    if (conditional) lines.push(conditional.label + ' · ' + number(conditional.amount) + ' per pop');
    if (hps !== null) lines.push(number(hps) + ' HPS per ally');
    if (note) lines.push(note);
  }
  if (r.splash) lines.push(number(r.splash) + ' adjacent-target injury ' + basis);
  if (r.periodic) lines.push(number(r.periodic) + ' additional injury per second');
  if (r.empowered)
    lines.push(
      'Empowered attack · ' +
        r.empowered.hits +
        ' hits of ' +
        number(r.empowered.damagePerHit) +
        ' HP and ' +
        number(r.empowered.injuryPerHit) +
        ' injury',
    );
  if (r.summon)
    lines.push(
      'Blood’s Whisper · full summon · ' +
        r.summon.ticks +
        ' ticks · ' +
        number(r.summon.damage) +
        ' Arts HP · ' +
        number(r.summon.injury) +
        ' potential injury',
    );
  if (r.element) {
    const sources: ('build' | 'summon')[] = r.summon && !b.plotSummon ? ['build', 'summon'] : ['build'];
    for (const source of sources) {
      const time = firstBurst(b, target, source);
      const label = source === 'summon' || time.summon ? 'Blood’s Whisper' : r.element;
      if (time.count === null) {
        lines.push(
          label + (time.limited ? ' · below threshold during this window' : ' · no burst from this source'),
        );
        continue;
      }
      const timing = [time.count + ' ' + time.unit + ' to burst'];
      if (time.seconds !== null) timing.push('first ' + seconds(time.seconds));
      if (time.recovery !== null) timing.push('recovery ' + seconds(time.recovery));
      if (time.repeat !== null) timing.push('next interval ' + seconds(time.repeat));
      else if (time.limited) timing.push('one burst this window');
      lines.push([label, ...timing].join(' · '));
    }
    const effect = fallout(r.element, target);
    if (effect) lines.push('Fallout · ' + effect.count + ' × ' + number(effect.perHit) + ' elemental HP');
    if (r.element === 'Rampage')
      lines.push('Rampage fallout · ramps to 2,110 elemental damage per second before resistance over 15 s');
  }
  for (const e of r.effects)
    lines.push(e.label + ' · ' + number(e.amount) + ' ' + e.type + ' · ' + e.condition);
  if (r.note) lines.push(r.note);
  return lines.filter(Boolean);
}

export async function renderComparisonImage({
  view,
  svg,
  metric,
  probe,
  target,
  targetName,
  healingView,
  series,
  timeline,
}: ExportOptions) {
  const box = svg.viewBox.baseVal;
  const chartHeight = Math.round((inner * box.height) / box.width);
  const image = plotImage(svg, chartHeight);
  const css = getComputedStyle(svg);
  const token = (name: string) => css.getPropertyValue(name).trim();
  const colors = {
    bg: token('--bg'),
    well: token('--well'),
    text: token('--text-bright'),
    dim: token('--text-dim'),
    line: token('--line'),
    teal: token('--teal'),
  };
  const body = token('--font-body') || 'sans-serif';
  const rows = series.map(({ build, value, colorToken }, index) => ({
    name: '#' + (index + 1) + ' ' + profile(build).name,
    value,
    color: token(colorToken),
    dashed: index % 2 === 1,
    label: [buildLabel(build), calculate(build, target).source, buildConditions(build)]
      .filter(Boolean)
      .join(' · '),
    details: view === 'detailed' ? breakdown(build, target) : [],
  }));
  // Capture the actual selected pair, activation delay and event rows on click.
  const deployment =
    view === 'detailed' && timeline
      ? {
          title: timeline.getAttribute('aria-label') || 'Deployment timeline',
          lines: Array.from(timeline.tBodies[0].rows, (row) => {
            const [time, event, atk, damage] = Array.from(row.cells, (cell) => cell.textContent);
            return [time, event, atk + ' ally ATK', damage !== '—' && damage + ' HP']
              .filter(Boolean)
              .join('   ·   ');
          }),
        }
      : null;
  await Promise.all([image.decode(), document.fonts.ready]);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser could not create the PNG.');
  function layout(draw: boolean) {
    const c = ctx!;
    let y = inset;
    function textLine(
      text: string,
      size: number,
      ink = colors.dim,
      weight = 400,
      x = inset,
      available = width - inset - x,
    ) {
      c.font = weight + ' ' + size + 'px ' + body;
      c.fillStyle = ink;
      c.textBaseline = 'top';
      let line = '';
      const emit = () => {
        if (draw) c.fillText(line, x, y, available);
        y += Math.ceil(size * 1.42);
      };
      for (const word of text.split(/\s+/)) {
        const next = line ? line + ' ' + word : word;
        if (line && c.measureText(next).width > available) {
          emit();
          line = word;
        } else line = next;
      }
      emit();
    }
    textLine('ARKPEDIA  /  DPS CALCULATOR', 16, colors.teal, 700);
    textLine(metric, 35, colors.text, 700);
    if (healingView) {
      textLine(targetName + ' · Healing per second per ally', 19);
    } else {
      textLine(
        [
          targetName,
          target.tier,
          number(target.def) + ' DEF',
          number(target.res) + ' RES',
          number(target.injuryRes) + ' injury RES',
          number(target.elementalRes) + ' elemental RES',
        ].join('   ·   '),
        19,
      );
      textLine(
        [
          'Probe · ' + probe,
          number(burstThreshold(target)) + ' injury threshold',
          'Active burst · ' + target.burst,
        ].join('    /    '),
        17,
      );
    }
    y += 14;
    if (draw) {
      c.fillStyle = colors.well;
      c.fillRect(inset, y, inner, chartHeight);
      c.drawImage(image, inset, y, inner, chartHeight);
    }
    y += chartHeight + 18;
    for (const row of rows) {
      if (draw) {
        c.fillStyle = colors.line;
        c.fillRect(inset, y, inner, 1);
        c.strokeStyle = row.color;
        c.lineWidth = 4;
        c.setLineDash(row.dashed ? [7, 3] : []);
        c.beginPath();
        c.moveTo(inset, y + 28);
        c.lineTo(inset + 25, y + 28);
        c.stroke();
        c.setLineDash([]);
      }
      y += 13;
      c.font = '700 23px ' + body;
      const valueWidth = c.measureText(row.value).width;
      if (draw) {
        c.fillStyle = colors.text;
        c.textBaseline = 'top';
        c.fillText(row.value, width - inset - valueWidth, y);
      }
      textLine(row.name, 23, colors.text, 700, inset + 36, inner - 52 - valueWidth);
      textLine(row.label, 18, colors.dim, 500, inset + 36);
      if (row.details.length) y += 5;
      for (const line of row.details) textLine(line, 17, colors.text, 400, inset + 36);
      y += 12;
    }
    if (deployment) {
      y += 12;
      textLine(deployment.title, 21, colors.text, 700);
      for (const line of deployment.lines) textLine(line, 17);
    }
    if (view === 'detailed') {
      y += 10;
      textLine(
        'Builds use 100% trust. DPS averages the source while active. Burst timing starts at first contact with an empty gauge on one surviving target.',
        16,
      );
    }
    return Math.ceil(y + inset / 2);
  }
  const height = layout(false);
  const scale = Math.min(1, 16000 / height, Math.sqrt(16000000 / (width * height)));
  canvas.width = Math.floor(width * scale);
  canvas.height = Math.ceil(height * scale);
  ctx.scale(scale, scale);
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, width, height);
  layout(true);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error('Your browser could not save this PNG.'))),
      'image/png',
    ),
  );
  return blob;
}
