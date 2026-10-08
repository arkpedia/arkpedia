import type { spine as Spine } from '@/lib/vendor/spine-3.8/spine-webgl';

/** Authored by the illustration controller, exported with the asset's model.json. */
export interface VoiceAction {
  id: string;
  body: { name: string; time: number; mix: number }[];
  mouth: { name: string; time: number }[];
}
export interface AnimationPlayback {
  extraTracks: { track: number; name: string }[];
  voiceActions: VoiceAction[];
}
export interface ArtworkVoice { id: string; title: string; url: string }
export const voiceAnimation = (id: string) => `voice:${id}`;

export function parsePlayback(value: unknown, animations: Record<string, number>): AnimationPlayback | null {
  if (value == null) return null;
  const fail = (): never => { throw new Error('Unsupported model.json: animation playback'); };
  if (typeof value !== 'object') return fail();
  const p = value as AnimationPlayback;
  const name = (n: unknown) => typeof n === 'string' && Object.hasOwn(animations, n);
  const time = (t: unknown) => typeof t === 'number' && Number.isFinite(t) && t >= 0;
  if (!Array.isArray(p.extraTracks) || p.extraTracks.length > 15 || !Array.isArray(p.voiceActions) || p.voiceActions.length > 64) return fail();
  const tracks = new Set<number>(), ids = new Set<string>();
  for (const x of p.extraTracks) {
    if (!x || !Number.isInteger(x.track) || x.track < 2 || x.track > 16 || tracks.has(x.track) || !name(x.name)) return fail();
    tracks.add(x.track);
  }
  for (const a of p.voiceActions) {
    if (!a || !/^CN_\d+$/.test(a.id) || ids.has(a.id) || !Array.isArray(a.body) || !a.body.length || !Array.isArray(a.mouth)) return fail();
    ids.add(a.id);
    for (const steps of [a.body, a.mouth]) {
      if (steps.length > 512) return fail();
      let previous = -1;
      for (const x of steps) {
        if (!x || !name(x.name) || !time(x.time) || x.time < previous || ('mix' in x && !time(x.mix))) return fail();
        previous = x.time;
      }
    }
    if (a.body.some(x => !time(x.mix))) return fail();
  }
  return { extraTracks: p.extraTracks.map(x => ({ ...x })), voiceActions: p.voiceActions.map(a => ({ id: a.id, body: a.body.map(x => ({ ...x })), mouth: a.mouth.map(x => ({ ...x })) })) };
}

/** Auxiliary tracks never replace the main artwork or appear as standalone controls. */
export function selectableAnimations(names: string[], playback: AnimationPlayback | null): string[] {
  const internal = new Set([...(playback?.extraTracks.map(x => x.name) ?? []), ...(playback?.voiceActions.flatMap(a => a.mouth.map(x => x.name)) ?? [])]);
  return [...names.filter(n => !internal.has(n) && !/^(?:exLayer(?:_|$)|Talk_\d+$)/i.test(n)), ...(playback?.voiceActions.map(a => voiceAnimation(a.id)) ?? [])];
}

export function voiceActionEnd(action: VoiceAction, durations: Record<string, number>): number {
  return Math.max(...action.body.map(x => x.time + durations[x.name]), ...action.mouth.map(x => x.time + durations[x.name]));
}

/** Track 0 is the body, track 1 the mouth; authored extra tracks are kept on tracks 2+. */
export class VoiceChoreography {
  private body = -1;
  private mouth = -1;
  constructor(readonly action: VoiceAction, private state: Pick<Spine.AnimationState, 'setAnimation'>) {}
  apply(time: number) {
    const at = <T extends { time: number }>(steps: T[]) => steps.reduce((last, x, i) => x.time <= time ? i : last, -1);
    const body = at(this.action.body), mouth = at(this.action.mouth);
    if (body >= 0) {
      const step = this.action.body[body];
      if (body !== this.body) {
        const entry = this.state.setAnimation(0, step.name, /^Idle\d*$/.test(step.name));
        entry.mixDuration = step.mix;
        this.body = body;
      }
    }
    if (mouth >= 0 && mouth !== this.mouth) {
      const entry = this.state.setAnimation(1, this.action.mouth[mouth].name, true);
      entry.mixDuration = 0;
      this.mouth = mouth;
    }
    return { body: this.action.body[body], mouth: this.action.mouth[mouth] };
  }
}
