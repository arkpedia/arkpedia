/**
 * Every string the chart maker shows that the Tier List maker does not already have
 * (lib/tier-list/strings.ts), in one table. The tool's name is not final: it is `title`
 * here and `navLabel`, and nowhere else.
 */
import type { AxisEnd, ChartKind } from './chart';

export const CHART_STRINGS = {
  title: 'Alignment chart maker',
  navLabel: 'Alignment Chart Maker',
  eyebrow: 'Rhodes Island // Community',
  sub: 'Place operators on a grid of your own labels, or anywhere between two axes.',
  description: 'Make an Arknights alignment chart: a labelled grid, or two axes with your own text.',

  boardHeading: 'Your chart',
  titleLabel: 'Chart name',
  titlePlaceholder: 'Name your chart',
  version: 'Chart version',
  kinds: { grid: 'Grid', axes: 'Axes' } satisfies Record<ChartKind, string>,
  columns: 'Columns',
  rows: 'Rows',
  fewer: (what: string) => `Fewer ${what.toLowerCase()}`,
  more: (what: string) => `More ${what.toLowerCase()}`,
  atLeast: (what: string) => `A grid has at least one of its ${what.toLowerCase()}.`,
  atMost: (what: string, max: number) => `A grid has at most ${max} ${what.toLowerCase()}.`,
  cellLabel: (row: number, col: number) => `Label of row ${row}, column ${col}`,
  cellItems: (label: string, row: number, col: number) => (label.trim() ? `Items in ${label.trim()}` : `Items in row ${row}, column ${col}`),
  cellPlaceholder: 'Label',
  axisLabel: { top: 'Top of the vertical axis', bottom: 'Bottom of the vertical axis', left: 'Left of the horizontal axis', right: 'Right of the horizontal axis' } satisfies Record<AxisEnd, string>,
  axisPlaceholder: { top: 'Top', bottom: 'Bottom', left: 'Left', right: 'Right' } satisfies Record<AxisEnd, string>,
  plane: 'The chart: drop items anywhere on it',
  hint: 'Drag items onto the chart. Drop one anywhere else to put it back.',
  empty: 'Empty the chart',
  emptyNothing: 'Nothing is on the chart yet.',
  startOver: 'Start over',
  startOverConfirm: 'Start over? This clears both versions of the chart and their labels.',
  saved: 'Saved in this browser.',
  notSaved: 'Not saved: a shared chart.',

  share: 'Share',
  shareDialog: 'Share this chart',
  shareModes: {
    full: { title: 'Full chart', body: 'Everything as it stands: the labels, what is placed and the chosen filters.' },
    template: { title: 'Template', body: 'The labels and the chosen filters with nothing placed, for others to fill in.' },
  },
  sharedNotice: { full: 'You are looking at a shared chart. Changes here are not saved, and your own chart is untouched.', template: 'You are looking at a shared chart template. Changes here are not saved, and your own chart is untouched.' },
  sharedBroken: 'That link does not hold a chart. Showing your own.',
  keepSharedConfirm: 'Replace your own saved chart with this one?',

  imageDialog: 'Chart image',
  imageFile: 'arkpedia-chart.png',
  imageAlt: (title: string) => (title.trim() ? `Chart image: ${title.trim()}` : 'Chart image'),
  imageSource: 'arkpedia.net/polls/chart-maker',

  indexTitle: 'Alignment chart maker',
  indexBody: 'Sort operators into a labelled grid, or place them anywhere between two axes.',
  indexAction: 'Start a chart',
} as const;
