/**
 * Every string the chart maker shows that the Tier List maker does not already have
 * (lib/tier-list/strings.ts), in one table.
 */
import type { AxisEnd, AxisLine, ChartKind } from './chart';

const CHART_NAME = 'Chart Maker';

export const CHART_STRINGS = {
  title: CHART_NAME,
  navLabel: CHART_NAME,
  eyebrow: 'Rhodes Island // Community',
  sub: 'Place operators on a labelled grid, a bingo board, or anywhere between two axes.',
  description: 'Make an Arknights chart, a bingo board, or a chart with two axes of your own.',

  boardHeading: 'Your chart',
  titleLabel: 'Chart name',
  titlePlaceholder: 'Name your chart',
  version: 'Chart version',
  kinds: { grid: 'Grid', bingo: 'Bingo', axes: 'Axes' } satisfies Record<ChartKind, string>,
  bingoTitle: 'Bingo title',
  bingoFree: 'Free space',
  bingoMode: 'Bingo mode',
  bingoMarkColor: 'Mark colour',
  bingoModes: { edit: 'Edit', play: 'Play' },
  bingoSquare: (row: number, col: number, content: string) => `Row ${row}, column ${col}${content ? `: ${content}` : ''}`,
  addColumn: 'Add a column',
  addRow: 'Add a row',
  removeColumn: (n: number) => `Remove column ${n}`,
  removeRow: (n: number) => `Remove row ${n}`,
  showGridHeaders: 'Show row and column labels',
  showCellLabels: 'Show cell labels',
  gridLabels: 'Grid labels',
  columnLabel: (n: number) => `Column ${n} label`,
  rowLabel: (n: number) => `Row ${n} label`,
  columnPlaceholder: (n: number) => `Column ${n}`,
  rowPlaceholder: (n: number) => `Row ${n}`,
  gridFull: (max: number) => `A grid has at most ${max} each way.`,
  cellLabel: (row: number, col: number) => `Label of row ${row}, column ${col}`,
  cellItems: (label: string, row: number, col: number) => (label.trim() ? `Items in ${label.trim()}` : `Items in row ${row}, column ${col}`),
  cellPlaceholder: 'Label',
  cellColor: (row: number, col: number) => `Colour of row ${row}, column ${col}`,
  cellColorReset: 'Back to its own colour',
  axisLabel: { top: 'Top of the vertical axis', bottom: 'Bottom of the vertical axis', left: 'Left of the horizontal axis', right: 'Right of the horizontal axis' } satisfies Record<AxisEnd, string>,
  axisPlaceholder: { top: 'Top', bottom: 'Bottom', left: 'Left', right: 'Right' } satisfies Record<AxisEnd, string>,
  axisLines: 'Axes shown',
  axisLine: { horizontal: 'Horizontal axis', vertical: 'Vertical axis' } satisfies Record<AxisLine, string>,
  plane: 'The chart: drop items anywhere on it',
  hint: 'Drag items onto the chart. Drop one anywhere else to put it back.',
  empty: 'Empty the chart',
  emptyNothing: 'Nothing is on the chart yet.',
  startOver: 'Start over',
  startOverConfirm: 'Start over? This clears all chart layouts and their labels.',
  saved: 'Saved in this browser.',
  notSaved: 'Not saved: a shared chart.',

  share: 'Share',
  shareDialog: 'Share this chart',
  shareModes: {
    full: { title: 'Full chart', body: 'Everything as it stands: the labels, what is placed and the chosen filters.' },
    template: { title: 'Template', body: 'The labels and the chosen filters with nothing placed, for others to fill in.' },
    quiz: { title: 'Quiz', body: 'Your grid, empty, and only the items you placed. Others sort them and are scored against your chart.' },
  },
  quizGridOnly: 'A quiz is made from the grid version.',
  sharedNotice: { full: 'You are looking at a shared chart. Changes here are not saved, and your own chart is untouched.', template: 'You are looking at a shared chart template. Changes here are not saved, and your own chart is untouched.', quiz: 'Quiz: drag every item into the cell you think its maker chose, then check your answers. Your own chart is untouched.' },
  quizDetail: (correct: number, total: number) => `${correct} of ${total} in the right cell`,
  quizRight: 'right cell',
  quizWrong: 'wrong cell',
  sharedBroken: 'That link does not hold a chart. Showing your own.',
  keepSharedConfirm: 'Replace your own saved chart with this one?',

  imageDialog: 'Chart image',
  imageFile: 'arkpedia-chart.png',
  imageAlt: (title: string) => (title.trim() ? `Chart image: ${title.trim()}` : 'Chart image'),
  imageSource: 'arkpedia.net/polls/chart-maker',

} as const;
