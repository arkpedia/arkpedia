import { operatorItemId, TIER_RARITIES, type TierCatalogue } from './catalogue';
import { defaultChart, type ChartState } from './chart';
import { CHART_PARAM, encodeChart } from './chartShare';
import { encodeTierList, SHARE_PARAM } from './share';
import { defaultTierList } from './state';

type Portrait = { name: string; image: string };
export type MakerSample = { href: string } & (
  | { kind: 'tier'; rows: { label: string; color: string; portraits: Portrait[] }[] }
  | { kind: 'grid'; columnLabels: string[]; rowLabels: string[]; portraits: (Portrait | null)[] }
  | { kind: 'axes'; labels: ChartState['axes']; points: { x: number; y: number; portrait: Portrait }[] }
);

const HAIR_COLOR_EXAMPLES = [
  { label: 'Red', color: '#ff7f7f', ids: ['char_103_angel', 'char_300_phenxi', 'char_420_flamtl', 'char_379_sesa', 'char_290_vigna'] },
  { label: 'Blue', color: '#7fbfff', ids: ['char_010_chen', 'char_213_mostma', 'char_2023_ling', 'char_437_mizuki', 'char_4042_lumen'] },
  { label: 'White', color: '#cfcfcf', ids: ['char_172_svrash', 'char_263_skadi', 'char_143_ghost', 'char_204_platnm', 'char_140_whitew'] },
];

// Each row has one Sniper, one Guard and one Defender of the named rarity.
const CLASS_EXAMPLES = [
  'char_103_angel', 'char_172_svrash', 'char_202_demkni',
  'char_204_platnm', 'char_140_whitew', 'char_226_hmau',
  'char_235_jesica', 'char_185_frncat', 'char_150_snakek',
];

// Elite 0 base stats, before Potential, talents or skills modify them.
const STAT_EXAMPLES = [
  { id: 'char_237_gravel', dp: 6, block: 1 },
  { id: 'char_102_texas', dp: 11, block: 2 },
  { id: 'char_150_snakek', dp: 17, block: 3 },
  { id: 'char_4042_lumen', dp: 21, block: 1 },
  { id: 'char_134_ifrit', dp: 31, block: 1 },
  { id: 'char_311_mudrok', dp: 32, block: 2 },
];

const AXES_MAX_DP = 40;
const AXES_MAX_BLOCK = 4;

export async function makeMakerSamples(operators: TierCatalogue['operators']): Promise<MakerSample[]> {
  const icons = new Map(operators.flatMap(({ id, name, icon }) => icon ? [[operatorItemId(id), { name, image: icon }] as const] : []));
  const items = (ids: string[]) => ids.map(operatorItemId).filter((id) => icons.has(id));
  const rarities = [...TIER_RARITIES];

  const tier = {
    ...defaultTierList(), rarities,
    rows: HAIR_COLOR_EXAMPLES.map(({ label, color, ids }, i) => ({
      id: `r${i + 1}`, label, color, items: items(ids),
    })),
  };
  const grid: ChartState = {
    ...defaultChart(), rarities,
    showGridHeaders: true, showCellLabels: false,
    columnLabels: ['Sniper', 'Guard', 'Defender'], rowLabels: ['6★', '5★', '4★'],
    cells: CLASS_EXAMPLES.map((id) => ({ label: '', items: items([id]) })),
  };
  const axes: ChartState = {
    ...defaultChart(), rarities, kind: 'axes',
    axes: { top: `${AXES_MAX_BLOCK} blocks`, bottom: '0 blocks', left: '0 DP', right: `${AXES_MAX_DP} DP` },
    points: STAT_EXAMPLES.flatMap(({ id, dp, block }) => items([id]).map((itemId) => ({
      id: itemId, x: dp / AXES_MAX_DP, y: 1 - block / AXES_MAX_BLOCK,
    }))),
  };
  const [tierLink, gridLink, axesLink] = await Promise.all([encodeTierList(tier), encodeChart(grid), encodeChart(axes)]);

  return [
    {
      kind: 'tier', href: `/polls/tier-list#${SHARE_PARAM}=${tierLink}`,
      rows: tier.rows.map(({ label, color, items }) => ({ label, color, portraits: items.map((id) => icons.get(id)!) })),
    },
    {
      kind: 'grid', href: `/polls/chart-maker#${CHART_PARAM}=${gridLink}`,
      columnLabels: grid.columnLabels, rowLabels: grid.rowLabels, portraits: grid.cells.map((cell) => icons.get(cell.items[0]) ?? null),
    },
    {
      kind: 'axes', href: `/polls/chart-maker#${CHART_PARAM}=${axesLink}`, labels: axes.axes,
      points: axes.points.map(({ id, x, y }) => ({ x, y, portrait: icons.get(id)! })),
    },
  ];
}
