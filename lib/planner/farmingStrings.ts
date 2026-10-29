/**
 * The words of the planner's Farming method (components/planner/FarmingMethod.tsx), kept in one
 * place like each feature's, so a site language can replace them together.
 */
export const FARMING_STRINGS = {
  label: 'Farming method',
  heading: 'Count what events give',
  lead: 'Set a date, and the free materials of every event open by then count as coming, so they leave "Still needed".',
  untilLabel: 'Count events until',
  off: 'Off',
  byBanner: 'A banner',
  byDate: 'A date',
  bannerLabel: 'Banner to count until',
  dateLabel: 'Until',
  bannerGone: 'That banner has left the schedule. Pick another, or a date.',
  none: 'No event in the schedule hands out materials by then.',
  summary: (events: number, materials: number, until: string) =>
    `Counting ${materials.toLocaleString('en-US')} materials from ${events} ${events === 1 ? 'event' : 'events'} until ${until}.`,
  estimated: '(est.)',
  shopsLabel: 'Event shops',
  shop: 'Buy limited-stock materials from the shops',
  unlimitedShop: 'Buy materials sold without a limit',
  assumes: 'Assumes you play each event through and have the currency to spend. Counted for the plan only: a Build still spends what is in your depot.',
  permanent: 'Permanent content, not yet claimed',
  permanentLead: 'Count every reward of a mode you have not claimed yet. They are available now, so they carry no date.',
  cnOnly: 'CN only',
  cnPart: (count: number) => `${count} CN only`,
  cnOnlyTitle: 'This mode, or part of it, is not on Global yet. Counting it counts rewards you cannot claim today.',
  permanentRewards: (rewards: number, materials: number) => `${rewards} unclaimed, ${materials.toLocaleString('en-US')} materials`,
  claimsRead: (labels: string) => `Claimed rewards are read from your imported account for ${labels}.`,
  claimsNone: 'No claimed rewards are read from your account for these, so every reward counts.',
  claimsUnchecked: 'Where the save keeps a mode\'s claims is read as documented and has not been checked against a real save: if a mode shows nothing claimed, tell us.',
  countingPermanent: (modes: string, materials: number) => `Counting ${materials.toLocaleString('en-US')} materials from unclaimed ${modes} rewards.`,
  counting: (materials: number, events: number, until: string) =>
    `Counting ${materials.toLocaleString('en-US')} materials from ${events} ${events === 1 ? 'event' : 'events'} until ${until}, not in your depot yet.`,
  fromEvents: (count: number) => `${count.toLocaleString('en-US')} expected from events and shops`,
  fromUnlimited: (count: number) => `${count.toLocaleString('en-US')} from a shop with no limit`,
  toCollect: 'to collect',
  by: (date: string) => `by ${date}`,
  sanityLead: 'to farm what is short',
  sanityEstimate: 'Estimate',
  sanityFrom: 'from',
  sanityScope: 'Materials only: LMD and EXP are not included.',
  sanityUncounted: 'No estimate for',
  /** Beside an operator whose whole bill is covered once the events are done. */
  operatorReady: (date: string) => `Materials by ${date}`,
  operatorReadyTitle: (date: string) => `Everything this plan asks for is in your depot or comes from the events you are counting, the last of it when an event ends on ${date}. Event dates marked estimated are projected from CN.`,
};
