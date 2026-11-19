import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { servedAssetExists } from '@/lib/assets/publicAssets';
import type { Operator } from '@/lib/operators/operatorTypes';
import { isGlobalPool180, type BannerArtworkOperator } from './bannerArtwork';
import { getBannerLineup, isLineupPending } from './bannerLineup';
import type { HeadhuntingBanner } from './headhuntingBanners';

interface ShopRow { type?: string; no?: string; start?: string; end?: string; operators?: string; store?: string }

export function readBannerShopRows(): ShopRow[] {
  // The content exporter has the importer's last good wiki rows, including store
  // flags aligned with its operator list. Older releases may only have banner props.
  const dir = join(process.cwd(), 'data', 'wiki-cache');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(file => /^Headhunting-Banners-\d{4}\.json$/.test(file))
    .flatMap(file => (JSON.parse(readFileSync(join(dir, file), 'utf8')) as { rows?: ShopRow[] }).rows ?? []);
}

const rarityWord = { 6: 'six', 5: 'five', 4: 'four' } as const;
const nameKey = (name: string) => name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();

export function buildBannerArtwork(
  banners: HeadhuntingBanner[],
  operators: Pick<Operator, 'name' | 'aliases'>[],
  rows: ShopRow[],
): Record<string, BannerArtworkOperator[]> {
  const names = new Map<string, string>();
  for (const { name, aliases } of operators) {
    for (const label of [name, ...(aliases ?? [])]) names.set(nameKey(label), name);
  }
  const canonical = (name: string) => names.get(nameKey(name)) ?? name;

  const shops = new Map<string, { lineup: string[]; shop: string[] }>();
  for (const row of rows) {
    const label = row.type === 'standard' ? 'Standard Pool' : row.type === 'kernel' ? 'Kernel' : null;
    const lineup = row.operators?.split(',').map(name => canonical(name.trim()));
    const flags = row.store?.split(',').map(flag => flag.trim());
    if (!label || !row.no || !row.start || !row.end || !lineup?.length || flags?.length !== lineup.length) continue;
    if (flags.some(flag => flag !== '0' && flag !== '1')) continue;
    const range = `${row.start.slice(0, 10)}–${row.end.slice(0, 10)}`;
    shops.set(`${label} #${row.no} (Global)|${range}`, { lineup, shop: lineup.filter((_, index) => flags[index] === '1') });
  }

  const result: Record<string, BannerArtworkOperator[]> = {};
  for (const banner of banners) {
    if (banner.banner_image || isLineupPending(banner) || banner.globalLineupPending) continue;
    const { featured } = getBannerLineup(banner);
    if (!featured.length) continue;
    const row = shops.get(`${banner.name}|${banner.global_date}`);
    const recurring = banner.pull_type === 'standard' || banner.pull_type === 'kernel';
    const roster = new Set(featured.map(operator => canonical(operator.name)));
    const shop = row?.lineup.length === roster.size && row.lineup.every(name => roster.has(name))
      ? row.shop
      // The official Pool #180 poster and the matching wiki row agree on these shop operators.
      : isGlobalPool180(banner) ? ['Stainless', 'Sand Reckoner'] : [];
    const shopSix = featured.filter(operator => operator.rarity === 6 && shop.includes(canonical(operator.name)));
    result[banner.name] = featured.map((operator): BannerArtworkOperator => {
      const { name, rarity } = operator;
      const operatorName = canonical(name);
      const inShop = shop.includes(operatorName) && (rarity !== 6 || shopSix.length === 1);
      const word = rarityWord[rarity];
      const artwork = (folder: string, label: string) => {
        const file = `${word}-star-${folder}/${operatorName} - ${label}.webp`;
        return servedAssetExists(file) ? `/${file}` : null;
      };
      if (rarity === 6 && recurring && shopSix.length !== 1) {
        return { ...operator, art: artwork('icons', 'Base'), elite: null, shop: false };
      }
      const desiredElite = rarity === 6 && !inShop ? 2 : 0;
      const art = artwork('skins', desiredElite === 2 ? 'Elite 2' : 'Base');
      return { ...operator, art: art ?? artwork('icons', 'Base'), elite: art && rarity === 6 ? desiredElite : null, shop: inShop };
    }).sort((a, b) => b.rarity - a.rarity || (a.rarity === 6 ? Number(a.shop) - Number(b.shop) : 0));
  }
  return result;
}
