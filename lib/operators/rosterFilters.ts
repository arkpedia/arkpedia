/** Old single-value links remain valid; empty means no restriction. */
export function filterValues(raw: string): string[] {
  return typeof raw === 'string' ? [...new Set(raw.split(',').filter(value => value && value !== 'all'))] : [];
}
export function toggleFilter(raw: string, value: string): string {
  const values = filterValues(raw);
  return (values.includes(value) ? values.filter(item => item !== value) : [...values, value]).join(',') || 'all';
}
