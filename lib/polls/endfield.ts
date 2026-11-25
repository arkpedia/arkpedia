import type { PollBanner } from './pull-poll';

export const ENDFIELD_BALLOT_ID = 'endfield-pull-or-skip-v1';
export const ENDFIELD_DRAFT = 'arkpedia.endfield-pull-poll.v1';
export const ENDFIELD_SOURCE = 'https://x.com/AKEndfield/status/2124116868583608507';
export const ENDFIELD_POLL = 'endfield-pull-or-skip' as const;

// Official post order. Media IDs keep ballots stable regardless of future artwork captions.
export const endfieldCards = [
  {id:'HXpPPBObIAAPMeX', description:'White hair, red dress and a raised black-gloved hand'},
  {id:'HXpPPCZbkAAOR6P', description:'Blonde operator adjusting her goggles, dressed in yellow'},
  {id:'HXpPPBRaEAA44Uw', description:'Dark-haired operator reaching forward, with a figure behind her'},
  {id:'HXpPPCLa0AAdbOI', description:'Pink-haired operator in a white and blue dress'},
  {id:'HXpPPCSbAAA0DE3', description:'Dark-haired operator with violet crystals beside her armor'},
  {id:'HXpPPCPb0AEs1BX', description:'Red-haired operator in black with a weapon across the artwork'},
  {id:'HXpPPBOagAA6EYt', description:'Purple-haired operator holding an open fan'},
  {id:'HXpPPBNbAAACvgr', description:'Pale blue-haired operator with a gold-tipped staff'},
  {id:'HXpPPCZacAA6Bp4', description:'White-haired operator holding a blue stringed instrument'},
];
export function endfieldArt(id: string, size: 'medium' | 'orig') {
  return `https://pbs.twimg.com/media/${id}.jpg?name=${size}`;
}
export const endfieldBanners: PollBanner[] = endfieldCards.map(({id,description}, index) => ({
  id, name: `Artwork ${index + 1}`, aliases: [], operators: [],
  start: '', end: '', endAt: null, estimated: false, image: endfieldArt(id, 'medium'),
  artwork: {description, original: endfieldArt(id, 'orig')},
}));
