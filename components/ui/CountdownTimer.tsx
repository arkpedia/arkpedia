import { windowCountdown } from '@/lib/schedule/gameWindow';
import { useEffect, useState } from 'react';

function formatRemaining(ms: number): string {
  if (ms <= 0) return 'Ended';
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

export default function CountdownTimer({ target, label, start }: { target: Date; label?: string; start?: Date }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Avoid a server/client mismatch -- render nothing meaningful until
  // mounted, since "now" can only be known client-side.
  if (!now) return <span className="countdown-timer">--</span>;

  const state = start ? windowCountdown(start, target, now) : null;
  const remaining = state?.remaining ?? target.getTime() - now.getTime();
  const activeLabel = state?.label ?? label;
  if (remaining <= 0) return <span className="countdown-timer">Ended</span>;
  return (
    <span className="countdown-timer">
      {activeLabel ? `${activeLabel}: ` : ''}
      {formatRemaining(remaining)}
    </span>
  );
}