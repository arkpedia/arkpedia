export const ENDFIELD_SOURCE = 'https://x.com/AKEndfield/status/2124116868583608507';
export const ENDFIELD_POLL = 'endfield-pull-or-skip' as const;

// Official post order. Media IDs keep ballots stable when more operator names are revealed.
export const endfieldCards = [
  {id:'HXpPPBObIAAPMeX', label:'Warfarin', description:'White hair, red dress and a raised black-gloved hand'},
  {id:'HXpPPCZbkAAOR6P', label:'Goggled explorer', description:'Blonde operator adjusting her goggles, dressed in yellow'},
  {id:'HXpPPBRaEAA44Uw', label:'Green-cloaked operator', description:'Dark-haired operator reaching forward, with a figure behind her'},
  {id:'HXpPPCLa0AAdbOI', label:'Pink-haired operator', description:'Pink-haired operator in a white and blue dress'},
  {id:'HXpPPCSbAAA0DE3', label:'Violet-armored operator', description:'Dark-haired operator with violet crystals beside her armor'},
  {id:'HXpPPCPb0AEs1BX', label:'Red-haired operator', description:'Red-haired operator in black with a weapon across the artwork'},
  {id:'HXpPPBOagAA6EYt', label:'Fan wielder', description:'Purple-haired operator holding an open fan'},
  {id:'HXpPPBNbAAACvgr', label:'Blue-haired staff wielder', description:'Pale blue-haired operator with a gold-tipped staff'},
  {id:'HXpPPCZacAA6Bp4', label:'White-haired musician', description:'White-haired operator holding a blue stringed instrument'},
];
export function endfieldArt(id: string, size: 'medium' | 'orig') {
  return `https://pbs.twimg.com/media/${id}.jpg?name=${size}`;
}
export const endfieldBallotItems = endfieldCards.map(({id}) => ({id,operators:[]}));
