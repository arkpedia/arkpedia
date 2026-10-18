import { useEffect, useState } from 'react';
import type { ServerId } from './yostar';

/** Local pacing, not a claim about Yostar's quota. No email, code or token is stored. */
export const CODE_COOLDOWN_KEY = 'arkpedia:code-cooldown:v1';
export const CODE_COOLDOWN_MS = 60_000;
const memory: Partial<Record<ServerId, number>> = {};

export function readCodeCooldown(server: ServerId, now: number): number {
  let deadline = memory[server] ?? 0;
  try { deadline = Number(localStorage.getItem(`${CODE_COOLDOWN_KEY}:${server}`)) || deadline; } catch { /* Private/blocked storage keeps the in-memory deadline. */ }
  return Number.isFinite(deadline) && deadline > now && deadline <= now + CODE_COOLDOWN_MS ? deadline : 0;
}

export function startCodeCooldown(server: ServerId, now: number): number {
  const deadline = now + CODE_COOLDOWN_MS;
  memory[server] = deadline;
  try { localStorage.setItem(`${CODE_COOLDOWN_KEY}:${server}`, String(deadline)); } catch { /* Sign-in still works without storage. */ }
  return deadline;
}

/** Absolute deadline survives closing/reopening the dialog and sleeping tabs. */
export function useCodeCooldown(server: ServerId) {
  const [remaining, setRemaining] = useState({ server, seconds: 0 });
  const update = () => {
    const now = Date.now();
    setRemaining({ server, seconds: Math.ceil((readCodeCooldown(server, now) - now) / 1000) });
  };
  useEffect(() => {
    const refresh = () => {
      const now = Date.now();
      setRemaining({ server, seconds: Math.max(0, Math.ceil((readCodeCooldown(server, now) - now) / 1000)) });
    };
    refresh();
    const timer = window.setInterval(refresh, 1000);
    window.addEventListener('storage', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('storage', refresh); };
  }, [server]);
  return {
    secondsLeft: remaining.server === server ? Math.max(0, remaining.seconds) : 0,
    begin: () => {
      if (readCodeCooldown(server, Date.now())) { update(); return false; }
      startCodeCooldown(server, Date.now());
      setRemaining({ server, seconds: 60 });
      return true;
    },
    finish: () => { startCodeCooldown(server, Date.now()); setRemaining({ server, seconds: 60 }); },
  };
}
