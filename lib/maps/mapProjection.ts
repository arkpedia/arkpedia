export const MAP_WIDTH = 1000;
export const MAP_HEIGHT = 500;

// Simple equirectangular projection: longitude -180..180 -> x 0..width,
// latitude 90..-90 -> y 0..height.
export function project(lat: number, lng: number): { x: number; y: number } {
  const x = ((lng + 180) / 360) * MAP_WIDTH;
  const y = ((90 - lat) / 180) * MAP_HEIGHT;
  return { x, y };
}

export type EventStatus = 'upcoming' | 'live' | 'ended';

export function getEventStatus(startTime: string, endTime: string | undefined, now: number): EventStatus {
  const start = new Date(startTime).getTime();
  const end = endTime ? new Date(endTime).getTime() : start + 24 * 60 * 60 * 1000;
  if (now < start) return 'upcoming';
  if (now >= start && now <= end) return 'live';
  return 'ended';
}

export function formatCountdown(startTime: string, now: number): string {
  const diffMs = new Date(startTime).getTime() - now;
  if (diffMs <= 0) return 'Starting now';

  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}