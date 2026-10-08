export function packDay(iso: string): string {
  return Number.isNaN(Date.parse(iso)) ? iso : new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Etc/GMT+7' });
}

