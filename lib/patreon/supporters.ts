export interface SupporterTier { id: string | number; name: string; supporters: string[] }
export interface SupporterList { 'supporter-tier': SupporterTier[] }
export interface SupporterSnapshot extends SupporterList { updatedAt: string }

/** Accept only the public projection, never arbitrary provider or credential objects. */
export function validSupporterSnapshot(value: unknown): value is SupporterSnapshot {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  if (Object.keys(row).sort().join(',') !== 'supporter-tier,updatedAt' || typeof row.updatedAt !== 'string' || !Number.isFinite(Date.parse(row.updatedAt)) || !Array.isArray(row['supporter-tier']) || row['supporter-tier'].length > 1000) return false;
  const text = (s: unknown): s is string => typeof s === 'string' && s.length > 0 && s.length <= 120 && !/[\u0000-\u001f\u007f]/.test(s);
  return row['supporter-tier'].every((tier: Record<string, unknown>) => tier && Object.keys(tier).sort().join(',') === 'id,name,supporters' && typeof tier.id === 'string' && /^\d{1,24}$/.test(tier.id) && text(tier.name) && Array.isArray(tier.supporters) && tier.supporters.length <= 10000 && tier.supporters.every(text));
}
