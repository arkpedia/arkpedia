// Server-only, reviewed associations. Do not infer in-game use from album category:
// OST albums also contain promotional music and unused instrumental arrangements.
import type { SongConnection } from './game';
import { MAIN_STORY_MUSIC } from './mainStory';
import { EVENT_EXPANSION } from './eventExpansion';

type Track = { id: string; role: SongConnection['role']; stages?: string[]; variant?: string; characters?: string[]; titles?: string[] };
export interface EventMusic { names: string[]; characters: string[]; source: string; tracks: Track[]; chapter?: number; kind?: 'vignette' }
const sequence = (prefix: string, count: number) => Array.from({ length: count }, (_, i) => `${prefix}-${i + 1}`);

export const EVENT_MUSIC: EventMusic[] = [
  {
    names: ['Near Light', '长夜临光'], characters: ['Nearl the Radiant Knight', 'Nearl alter', 'NTR Knight', 'Margaret Nearl', 'Flametail'],
    source: 'https://arknights.wiki.gg/wiki/Near_Light/Sound_of_Alley',
    tracks: [
      { id: '125091', role: 'lobby' },
      { id: '697642', role: 'battle', variant: '1', stages: ['NL-2', 'NL-4', 'NL-6', 'NL-8', 'NL-EX-1', 'NL-EX-3', 'NL-EX-5', 'NL-EX-7', 'NL-S-1', 'NL-S-3', 'NL-TR-1', 'NL-TR-2'] },
      { id: '953900', role: 'battle', variant: '2', stages: ['NL-1', 'NL-3', 'NL-5', 'NL-7', 'NL-9', 'NL-EX-2', 'NL-EX-4', 'NL-EX-6', 'NL-S-2', 'NL-S-5'] },
      { id: '048729', role: 'boss', stages: ['NL-10', 'NL-EX-8', 'NL-S-4'], characters: ['Blood Knight', 'Dikaiopolis', 'Dikaiopolis the Blood Knight'] },
    ],
  },
  {
    names: ['Stultifera Navis', '愚人号'], characters: ['Specter the Unchained', 'Specter alter', 'Spalter', 'Laurentina', 'Irene'],
    source: 'https://arknights.wiki.gg/wiki/Stultifera_Navis/Tidal_Records',
    tracks: [
      { id: '880362', role: 'lobby' },
      { id: '514570', role: 'battle', variant: '1', stages: ['SN-1', 'SN-2', 'SN-3', 'SN-EX-1', 'SN-EX-2', 'SN-EX-3', 'SN-S-1-A', 'SN-S-1-B', 'SN-S-2-A', 'SN-S-2-B', 'SN-TR-1'] },
      { id: '306849', role: 'battle', variant: '2', stages: ['SN-4', 'SN-5', 'SN-6', 'SN-EX-4', 'SN-EX-5', 'SN-S-3-A', 'SN-S-3-B'] },
      { id: '697654', role: 'battle', variant: '3', stages: ['SN-7', 'SN-8', 'SN-9', 'SN-EX-6', 'SN-EX-7', 'SN-S-4-A', 'SN-S-4-B'] },
      { id: '953915', role: 'boss', stages: ['SN-10', 'SN-EX-8', 'SN-S-5'], characters: ['The Endspeaker', 'Endspeaker', 'Will of We Many'] },
    ],
  },
  {
    names: ['Where Vernal Winds Will Never Blow', '登临意'], characters: ['Chongyue', 'Lin', 'Lin Yuhsia'],
    source: 'https://arknights.wiki.gg/wiki/Where_Vernal_Winds_Will_Never_Blow/BGM',
    tracks: [
      { id: '514559', role: 'lobby' },
      { id: '880344', role: 'battle', variant: '1', stages: sequence('WB', 8) },
      { id: '461167', role: 'battle', variant: '2', stages: [...sequence('WB-EX', 7), 'WB-TR-1'] },
      { id: '048710', role: 'boss', stages: ['WB-9', 'WB-EX-8'], characters: ['Ya'] },
    ],
  },
  {
    names: ['The Great Chief Returns', 'Gavial the Great Chief Returns', '密林悍将归来'], characters: ['Eunectes', 'Zumama', 'Gavial'],
    source: 'https://arknights.wiki.gg/wiki/The_Great_Chief_Returns/BGM',
    tracks: [
      { id: '232278', role: 'lobby' },
      { id: '953996', role: 'battle', variant: '1', stages: ['RI-1', 'RI-2', 'RI-EX-1', 'RI-EX-2'] },
      { id: '306823', role: 'battle', variant: '2', stages: ['RI-3', 'RI-4', 'RI-EX-3', 'RI-EX-4', 'RI-TR-1'] },
      { id: '953995', role: 'battle', variant: '3', stages: ['RI-5', 'RI-6', 'RI-7', 'RI-9', 'RI-EX-5', 'RI-EX-6', 'RI-EX-7'] },
      // The boss uses the instrumental recording, not the vocal promotional single.
      { id: '880377', role: 'boss', stages: ['RI-8', 'RI-EX-8'], characters: ['The Big Ugly Thing', 'Big Ugly Thing', 'Big Ugly'] },
    ],
  },
  {
    names: ['Come Catastrophes or Wakes of Vultures', '不义之财'], characters: ['Jessica the Liberated', 'Jessica alter', 'Jessicalter'],
    source: 'https://arknights.wiki.gg/wiki/Come_Catastrophes_or_Wakes_of_Vultures/BGM',
    tracks: [
      { id: '697625', role: 'lobby' },
      { id: '232261', role: 'battle', stages: [...sequence('CV', 7), ...sequence('CV-EX', 7), 'CV-TR-1'] },
      { id: '880332', role: 'boss', stages: ['CV-8', 'CV-EX-8'], characters: ['Cliff', 'Clip Cliff'] },
    ],
  },
  {
    names: ['The Rides to Lake Silberneherze', '银心湖列车'], characters: ['Degenbrecher', 'The Black Knight', 'Black Knight'],
    source: 'https://arknights.wiki.gg/wiki/The_Rides_to_Lake_Silberneherze/BGM',
    tracks: [
      { id: '514538', role: 'lobby' },
      { id: '779486', role: 'battle', stages: [...sequence('RS', 7), ...sequence('RS-EX', 7)] },
      { id: '461143', role: 'boss', stages: ['RS-8', 'RS-EX-8'], characters: ['Harold', 'Harold Craigavon'] },
    ],
  },
  {
    names: ['Zwillingstürme im Herbst', '崔林特尔梅之金'], characters: ['Virtuosa', 'Arturia', 'Arturia Giallo', 'Viviana', 'Candle Knight'],
    source: 'https://arknights.wiki.gg/wiki/Zwillingst%C3%BCrme_im_Herbst/BGM',
    tracks: [
      { id: '514547', role: 'lobby' },
      { id: '125078', role: 'battle', variant: '1', stages: [...sequence('ZT', 7), 'ZT-EX-1', 'ZT-EX-4', 'ZT-S-1', 'ZT-TR-1'] },
      { id: '779496', role: 'battle', variant: '2', stages: ['ZT-8', 'ZT-9', 'ZT-EX-1', 'ZT-EX-2', 'ZT-EX-3', 'ZT-EX-5', 'ZT-EX-6', 'ZT-EX-7', 'ZT-S-2', 'ZT-S-4', 'ZT-TR-2'] },
      { id: '697623', role: 'boss', variant: 'phase 1', stages: ['ZT-10', 'ZT-EX-8', 'ZT-S-3', 'ZT-S-5'], characters: ['Witch King', 'Herkunftshorn'] },
      { id: '779495', role: 'boss', variant: 'imperial', stages: ['ZT-10', 'ZT-EX-8', 'ZT-S-3', 'ZT-S-5'], characters: ['Witch King', 'Herkunftshorn'] },
      { id: '461151', role: 'boss', variant: 'variation', stages: ['ZT-10', 'ZT-EX-8', 'ZT-S-3', 'ZT-S-5'], characters: ['Witch King', 'Herkunftshorn'] },
    ],
  },
  {
    names: ['Babel', '巴别塔'], characters: ['Ascalon'],
    source: 'https://arknights.wiki.gg/wiki/Babel_%28event%29/BGM',
    tracks: [
      { id: '779480', role: 'lobby', stages: ['BB-9'] },
      { id: '953979', role: 'battle', stages: [...sequence('BB', 8), ...sequence('BB-EX', 8)] },
      { id: '697614', role: 'boss', stages: ['BB-10'], characters: ['Amiya'] },
    ],
  },
  {
    names: ['Operation Originium Dust', '源石尘行动'], characters: ['Ash', 'Eliza Cohen', 'Blitz', 'Frost', 'Tachanka'],
    source: 'https://arknights.wiki.gg/wiki/Operation_Originium_Dust/BGM',
    tracks: [
      { id: '880371', role: 'lobby' },
      { id: '306856', role: 'battle', variant: '1', stages: [...sequence('OD', 3), ...sequence('OD-EX', 4), 'OD-TR-1'] },
      { id: '697663', role: 'battle', variant: '2', stages: ['OD-4', 'OD-5', 'OD-6', 'OD-7', 'OD-EX-4', 'OD-EX-5', 'OD-EX-6', 'OD-EX-7'] },
      { id: '306855', role: 'boss', stages: ['OD-8', 'OD-EX-8'], characters: ['Essence of Evolution'] },
    ],
  },
  {
    names: ['Operation Lucent Arrowhead', '水晶箭行动'], characters: ['Ela', 'Iana', 'Doc', 'Fuze'],
    source: 'https://arknights.wiki.gg/wiki/Operation_Lucent_Arrowhead/BGM',
    tracks: [
      { id: '953970', role: 'lobby' },
      { id: '461149', role: 'battle', stages: [...sequence('CR', 7), ...sequence('CR-EX', 7)] },
      { id: '232254', role: 'boss', stages: ['CR-8', 'CR-EX-8'], characters: ['Mateo', 'Captain Mateo'] },
    ],
  },
  {
    names: ['Code of Brawl', '喧闹法则'], characters: ['Mostima', 'Bison'],
    source: 'https://arknights.wiki.gg/wiki/Code_of_Brawl/BGM',
    tracks: [
      { id: '697631', role: 'lobby' },
      { id: '514581', role: 'battle', variant: '1', stages: ['CB-1', 'CB-2', 'CB-3', 'CB-4', 'CB-6', 'CB-7', 'CB-EX1', 'CB-EX2', 'CB-EX3', 'CB-EX4'] },
      { id: '232207', role: 'battle', variant: '2', stages: ['CB-5', 'CB-8', 'CB-9', 'CB-EX5', 'CB-EX6', 'CB-EX8'] },
      { id: '048749', role: 'boss', stages: ['CB-10', 'CB-EX7'], characters: ['Rat King', 'Lin Kojui'] },
      { id: '880374', role: 'story', stages: ['CB-ST3'], characters: ['Exusiai'] },
    ],
  },
  {
    names: ['Heart of Surging Flame', '火蓝之心'], characters: ['Schwarz'],
    source: 'https://arknights.wiki.gg/wiki/Heart_of_Surging_Flame/BGM',
    tracks: [
      { id: '461192', role: 'lobby', variant: 'Alive Until Sunset' },
      { id: '953920', role: 'lobby', variant: 'Emperor' },
      { id: '125019', role: 'lobby', variant: 'DDD' },
    ],
  },
  {
    names: ['Il Siracusano', '叙拉古人'],
    characters: ['Texas the Omertosa', 'Texas alter', 'Texalter', 'Penance', 'Lavinia', 'Lavinia Falcone'],
    source: 'https://arknights.wiki.gg/wiki/Il_Siracusano/BGM',
    tracks: [
      { id: '048728', role: 'lobby' },
      { id: '880356', role: 'battle', stages: [...sequence('IS', 9), ...sequence('IS-EX', 7), ...sequence('IS-S', 4)] },
      { id: '514563', role: 'boss', stages: ['IS-10', 'IS-EX-8', 'IS-S-5'], characters: ['Zaaro'], titles: ['Wlfmster'] },
    ],
  },
  {
    names: ['Lone Trail', '孤星'],
    characters: ['Muelsyse', "Ho'olheyak"],
    source: 'https://arknights.wiki.gg/wiki/Lone_Trail/BGM',
    tracks: [
      { id: '125074', role: 'lobby' },
      { id: '048721', role: 'battle', variant: '1', stages: ['CW-1', 'CW-2', 'CW-6'] },
      { id: '461158', role: 'battle', variant: '2', stages: ['CW-3', 'CW-4', 'CW-5', 'CW-7', 'CW-8', 'CW-9', ...sequence('CW-EX', 7), ...sequence('CW-S', 3)] },
      { id: '880337', role: 'boss', stages: ['CW-10', 'CW-EX-8', 'CW-S-4'], characters: ['Kristen', 'Kristen Wright', 'Control'] },
      { id: '232266', role: 'story' },
      { id: '125073', role: 'story' },
    ],
  },
  {
    names: ['What the Firelight Casts', '照我以火'],
    characters: ['Reed the Flame Shadow', 'Reed the Flameshadow', 'Reed alter', 'Reedalter', 'Loughshinny', 'Loughshinny Dublinn'],
    source: 'https://arknights.wiki.gg/wiki/What_the_Firelight_Casts/BGM',
    tracks: [
      { id: '880351', role: 'lobby' },
      { id: '779412', role: 'battle', stages: [...sequence('FC', 7), ...sequence('FC-EX', 7)] },
      { id: '306830', role: 'boss', stages: ['FC-8', 'FC-EX-8'], characters: ['Eblana', 'Eblana Dublinn', 'Necrass', 'The Leader'] },
    ],
  },
  {
    names: ['So Long, Adele', 'So Long, Adele: Home Away From Home', '火山旅梦'],
    characters: ['Eyjafjalla the Hvít Aska', 'Eyjafjalla alter', 'Eyja alter', 'Eyjalter', 'Adele', 'Adele Naumann', 'Swire the Elegant Wit', 'Swire alter', 'Swirealter', 'Beatrix', 'Beatrix Schwire'],
    source: 'https://arknights.wiki.gg/wiki/So_Long%2C_Adele/BGM',
    tracks: [
      { id: '048708', role: 'lobby', variant: 'day' },
      { id: '306816', role: 'lobby', variant: 'night' },
      { id: '306815', role: 'battle', variant: '1', stages: ['SL-2', 'SL-4', 'SL-5', 'SL-7', 'SL-EX-2', 'SL-EX-3', 'SL-EX-7', 'SL-P-1', 'SL-P-3', 'SL-S-2'] },
      { id: '953981', role: 'battle', variant: '2', stages: ['SL-1', 'SL-3', 'SL-6', 'SL-EX-1', 'SL-EX-4', 'SL-EX-6', 'SL-MO-1', 'SL-P-2', 'SL-S-1', 'SL-S-4', 'SL-TR-1'] },
      { id: '232262', role: 'boss', stages: ['SL-8', 'SL-EX-8', 'SL-S-3', 'SL-S-5', 'SL-TR-2'], characters: ['Dolly', 'Dolly the Sheep'] },
      { id: '125070', role: 'story' },
    ],
  },

  {
    names: ['Break the Ice', '风雪过境'], characters: ['Gnosis', 'Gnosis Edelweiss'],
    source: 'https://arknights.wiki.gg/wiki/Break_the_Ice/BGM',
    tracks: [
      { id: '125099', role: 'lobby' },
      { id: '306834', role: 'battle', variant: '1', stages: [...sequence('BI', 4), ...sequence('BI-EX', 4), 'BI-TR-1', 'BI-TR-2'] },
      { id: '048727', role: 'battle', variant: '2', stages: ['BI-5', 'BI-6', 'BI-7', 'BI-EX-5', 'BI-EX-6', 'BI-EX-7'] },
      { id: '953908', role: 'boss', stages: ['BI-8', 'BI-EX-8'], characters: ['Degenbrecher', 'The Black Knight', 'Black Knight'] },
    ],
  },
  {
    names: ['Guide Ahead', 'Guiding Ahead', '吾导先路'], characters: ['Fiammetta'],
    source: 'https://arknights.wiki.gg/wiki/Guide_Ahead/BGM',
    tracks: [
      { id: '048718', role: 'lobby' },
      { id: '697636', role: 'battle', stages: [...sequence('GA', 7), ...sequence('GA-EX', 7)] },
      { id: '125083', role: 'boss', stages: ['GA-8', 'GA-EX-8'], characters: ['Andoain', "Andoain the Martyr", 'The Martyr'] },
    ],
  },
  {
    names: ['Lingering Echoes', '尘影余音'], characters: ['Ebenholz', 'Hibiscus the Purifier', 'Hibiscus alter'],
    source: 'https://arknights.wiki.gg/wiki/Lingering_Echoes/BGM',
    tracks: [
      { id: '461187', role: 'lobby' },
      { id: '697650', role: 'battle', stages: [...sequence('LE', 7), ...sequence('LE-EX', 7)] },
      { id: '048739', role: 'boss', variant: 'phase 1', stages: ['LE-8', 'LE-EX-8'], characters: ['Kreide', 'Kreide Worldly Remains'] },
    ],
  },
  {
    names: ["Dorothy's Vision", '绿野幻梦'], characters: ['Dorothy'],
    source: 'https://arknights.wiki.gg/wiki/Dorothy%27s_Vision/BGM',
    tracks: [
      { id: '779410', role: 'lobby' },
      { id: '048721', role: 'battle', stages: [...sequence('DV', 7), ...sequence('DV-EX', 7)] },
      { id: '953902', role: 'boss', stages: ['DV-8', 'DV-EX-8'], characters: ['Awaken'] },
    ],
  },
  {
    names: ['Dossoles Holiday', '多索雷斯假日'], characters: ["Ch'en the Holungday", 'Chen alter', 'Chalter', 'Mizuki'],
    source: 'https://arknights.wiki.gg/wiki/Dossoles_Holiday/BGM',
    tracks: [
      { id: '880359', role: 'lobby' },
      { id: '697644', role: 'battle', variant: '1', stages: [...sequence('DH', 5), 'DH-EX-1', 'DH-EX-5', 'DH-EX-6', 'DH-MO-1', 'DH-S-1', 'DH-S-4', 'DH-TR-1'] },
      { id: '514567', role: 'battle', variant: '2', stages: ['DH-6', 'DH-7', 'DH-8', 'DH-EX-2', 'DH-EX-3', 'DH-EX-4', 'DH-EX-7', 'DH-S-2', 'DH-S-3', 'DH-TR-2'] },
      { id: '306838', role: 'boss', stages: ['DH-9', 'DH-EX-8'], characters: ['Pancho', 'Pancho Salas'] },
    ],
  },
  {
    names: ['Ideal City', 'Ideal City: Endless Carnival', '理想城', '理想城：长夏狂欢季'], characters: ['Gavial the Invincible', 'Gavial alter', 'Gavialter', 'Pozyëmka', 'Pozyomka'],
    source: 'https://arknights.wiki.gg/wiki/Ideal_City/BGM',
    tracks: [
      { id: '125092', role: 'lobby' },
      { id: '048720', role: 'battle', variant: '1', stages: [...sequence('IC', 4), ...sequence('IC-EX', 4), 'IC-MO-1', 'IC-P-1', 'IC-P-2', 'IC-TR-1'] },
      { id: '779419', role: 'battle', variant: '2', stages: ['IC-5', 'IC-6', 'IC-7', 'IC-8', 'IC-EX-5', 'IC-EX-6', 'IC-EX-7', 'IC-S-1', 'IC-S-2', 'IC-S-3', 'IC-MO-1'] },
      { id: '461174', role: 'boss', stages: ['IC-9', 'IC-EX-8', 'IC-S-4', 'IC-MO-1'], characters: ['Materialist Antagonizer', 'Minimalist'] },
    ],
  },
  {
    names: ['Who is Real', '画中人'], characters: ['Dusk', 'Saga'],
    source: 'https://arknights.wiki.gg/wiki/Who_is_Real/BGM',
    tracks: [
      { id: '953903', role: 'lobby' },
      { id: '697645', role: 'battle', variant: '1', stages: ['WR-1', 'WR-2', 'WR-3', 'WR-EX-1', 'WR-EX-2', 'WR-TR-1'] },
      { id: '779411', role: 'battle', variant: '2', stages: ['WR-4', 'WR-5', 'WR-6', 'WR-EX-3', 'WR-EX-4'] },
      { id: '048722', role: 'battle', variant: '3', stages: ['WR-7', 'WR-8', 'WR-9', 'WR-EX-5', 'WR-EX-6', 'WR-EX-7'] },
      { id: '880350', role: 'boss', stages: ['WR-10', 'WR-EX-8'], characters: ['Free'] },
    ],
  },
  {
    names: ['Invitation to Wine', '将进酒'], characters: ['Ling', 'Lee'],
    source: 'https://arknights.wiki.gg/wiki/Invitation_to_Wine/BGM',
    tracks: [
      { id: '125094', role: 'lobby' },
      { id: '232287', role: 'battle', variant: '1', stages: [...sequence('IW', 4), ...sequence('IW-EX', 4)] },
      { id: '514568', role: 'battle', variant: '2', stages: ['IW-5', 'IW-6', 'IW-7', 'IW-8', 'IW-EX-5', 'IW-EX-6', 'IW-EX-7'] },
      { id: '306839', role: 'boss', stages: ['IW-9', 'IW-EX-8'], characters: ['Sui-Xiang'] },
    ],
  },
  {
    names: ['Mansfield Break', '孤岛风云'], characters: ['Mountain', 'Anthony', 'Anthony Simon'],
    source: 'https://arknights.wiki.gg/wiki/Mansfield_Break/BGM',
    tracks: [
      { id: '779404', role: 'lobby' },
      { id: '232277', role: 'battle', variant: '1', stages: [...sequence('MB', 5), ...sequence('MB-EX', 4)] },
      { id: '125088', role: 'battle', variant: '2', stages: ['MB-6', 'MB-7', 'MB-EX-5', 'MB-EX-6', 'MB-EX-7'] },
      { id: '880346', role: 'boss', stages: ['MB-8', 'MB-EX-8'], characters: ['Jesselton', 'Jesselton Williams'] },
    ],
  },
  {
    names: ['Maria Nearl', '玛莉娅·临光'], characters: ['Blemishine', 'Maria Nearl'],
    source: 'https://arknights.wiki.gg/wiki/Maria_Nearl/BGM',
    tracks: [
      { id: '514551', role: 'lobby' },
      { id: '048712', role: 'battle', variant: '1', stages: [...sequence('MN', 6), ...sequence('MN-EX', 4)] },
      { id: '697630', role: 'battle', variant: '2', stages: ['MN-7', 'MN-EX-5', 'MN-EX-6', 'MN-EX-7'] },
      { id: '461169', role: 'boss', stages: ['MN-8', 'MN-EX-8'], characters: ['Corrupted Knight', 'Withered Knight', 'Corrupted and Withered Knights'] },
    ],
  },
  {
    names: ['Under Tides', '覆潮之下'], characters: ['Skadi the Corrupting Heart', 'Skadi alter', 'Skalter', "Kal'tsit"],
    source: 'https://arknights.wiki.gg/wiki/Under_Tides/BGM',
    tracks: [
      { id: '306822', role: 'lobby' },
      { id: '514550', role: 'battle', stages: [...sequence('SV', 8), ...sequence('SV-EX', 7)] },
      { id: '461185', role: 'boss', stages: ['SV-9', 'SV-EX-8'], characters: ['Quintus', 'Sal Viento Bishop Quintus'] },
    ],
  },
  {
    names: ['A Walk in the Dust', '遗尘漫步'], characters: ['Passenger'],
    source: 'https://arknights.wiki.gg/wiki/A_Walk_in_the_Dust/BGM',
    tracks: [
      { id: '779403', role: 'lobby' },
      { id: '880345', role: 'battle', stages: [...sequence('WD', 7), ...sequence('WD-EX', 7)] },
      { id: '048711', role: 'boss', stages: ['WD-8', 'WD-EX-8'], characters: ["Emperor's Blade", "Emperor's Blade Pursuer"] },
    ],
  },
  {
    names: ['Darknights Memoir', '生于黑夜'], characters: ['Phantom'],
    source: 'https://arknights.wiki.gg/wiki/Darknights_Memoir/BGM',
    tracks: [
      { id: '514552', role: 'lobby' },
      { id: '461160', role: 'battle', variant: '1', stages: ['DM-1', 'DM-6', 'DM-EX-1', 'DM-EX-2'], titles: ['Kazdel'] },
      { id: '125089', role: 'battle', variant: '2', stages: ['DM-2', 'DM-3', 'DM-4', 'DM-5', 'DM-EX-3', 'DM-EX-4'] },
      { id: '306824', role: 'battle', variant: '3', stages: ['DM-7', 'DM-8', 'DM-EX-5', 'DM-EX-6'] },
      { id: '880347', role: 'battle', variant: '4', stages: ['DM-MO-1'] },
    ],
  },
  {
    names: ['Twilight of Wolumonde', '沃伦姆德的薄暮'], characters: ['Suzuran', 'Lisa'],
    source: 'https://arknights.wiki.gg/wiki/Twilight_of_Wolumonde/BGM',
    tracks: [
      { id: '953985', role: 'lobby' },
      { id: '048701', role: 'battle', variant: '1', stages: [...sequence('TW', 4), 'TW-EX-3', 'TW-EX-4'] },
      { id: '779492', role: 'battle', variant: '2', stages: ['TW-5', 'TW-6', 'TW-7', 'TW-EX-1', 'TW-EX-2', 'TW-EX-5', 'TW-EX-6', 'TW-EX-7', 'TW-MO-1', 'TW-S-1', 'TW-TR-1'] },
      { id: '697620', role: 'boss', stages: ['TW-8', 'TW-EX-8', 'TW-S-2'], characters: ['Mudrock'] },
    ],
  },
  {
    names: ['Hortus de Escapismo', '空想花庭'], characters: ['Executor the Ex Foedere', 'Executor alter', 'FedEx', 'Federico', 'Federico Giallo'],
    source: 'https://arknights.wiki.gg/wiki/Hortus_de_Escapismo/BGM',
    tracks: [
      { id: '953983', role: 'lobby' },
      { id: '880335', role: 'battle', stages: [...sequence('HE', 7), ...sequence('HE-EX', 7)] },
      { id: '514541', role: 'boss', stages: ['HE-8', 'HE-EX-8'], characters: ['Clément', 'Clément Dubois', 'The Gardener', 'Gardener'] },
    ],
  },
];

// CC numbering follows https://arknights.wiki.gg/wiki/Soundtrack/BGM/Contingency_Contract
// Usage can be checked at /wiki/Contingency_Contract_<name>/BGM.
// Exclude OST instrumental bonus tracks: they are not the in-game lobby recording.
// Also exclude the Barrenland W&W promotional mix, not its in-game menu BGM.
export const CC_MUSIC: { name: string; series: 'cc' | 'ccb'; number: number; lobby: string; battles: { id: string; variant?: string }[] }[] = [
  { name: 'Pyrite', series: 'cc', number: 1, lobby: '048747', battles: [] },
  { name: 'Blade', series: 'cc', number: 2, lobby: '880378', battles: [] },
  { name: 'Cinder', series: 'cc', number: 3, lobby: '461196', battles: [{ id: '461160', variant: '1' }, { id: '880347', variant: '2' }] },
  { name: 'Lead Seal', series: 'cc', number: 4, lobby: '125001', battles: [] },
  { name: 'Spectrum', series: 'cc', number: 5, lobby: '779420', battles: [{ id: '697658' }] },
  { name: 'Wild Scales', series: 'cc', number: 6, lobby: '953919', battles: [] },
  { name: 'Pine Soot', series: 'cc', number: 7, lobby: '880365', battles: [] },
  { name: 'Dawnseeker', series: 'cc', number: 8, lobby: '125009', battles: [{ id: '953917' }] },
  { name: 'Deepness', series: 'cc', number: 9, lobby: '306847', battles: [{ id: '232296' }] },
  { name: 'Ashring', series: 'cc', number: 10, lobby: '306837', battles: [{ id: '514566' }] },
  { name: 'Fake Waves', series: 'cc', number: 11, lobby: '461171', battles: [{ id: '697640' }] },
  { name: 'Base Point', series: 'cc', number: 12, lobby: '697635', battles: [{ id: '232272' }] },
  { name: 'Pyrolysis', series: 'ccb', number: 1, lobby: '048704', battles: [{ id: '953988' }] },
  { name: 'Underdawn', series: 'ccb', number: 2, lobby: '048798', battles: [{ id: '232253', variant: '1' }, { id: '880325', variant: '2' }] },
  { name: 'Extinguished Sins', series: 'ccb', number: 3, lobby: '232249', battles: [{ id: '697607' }] },
  { name: 'Arclight', series: 'ccb', number: 4, lobby: '514513', battles: [{ id: '880305' }] },
];

export function getReviewedAssociations() {
  const result = new Map<string, { inGame: true; connections: SongConnection[]; titleAliases?: string[] }>();
  for (const event of [...EVENT_MUSIC, ...MAIN_STORY_MUSIC, ...EVENT_EXPANSION]) {
    for (const track of event.tracks) {
      result.set(track.id, {
        inGame: true,
        ...((track.titles || result.get(track.id)?.titleAliases) ? { titleAliases: [...new Set([...(result.get(track.id)?.titleAliases || []), ...(track.titles || [])])] } : {}),
        connections: [...(result.get(track.id)?.connections || []), {
          names: event.names, characters: [...event.characters, ...(track.characters || [])], role: track.role,
          ...(event.chapter !== undefined ? { chapter: event.chapter } : {}),
          ...(event.kind ? { kind: event.kind } : {}),
          ...(track.stages ? { stages: track.stages } : {}), ...(track.variant ? { variant: track.variant } : {}),
        }],
      });
    }
  }
  for (const cc of CC_MUSIC) {
    for (const track of [{ id: cc.lobby, role: 'lobby' as const }, ...cc.battles.map((battle) => ({ ...battle, role: 'battle' as const }))]) {
      result.set(track.id, { ...result.get(track.id), inGame: true, connections: [...(result.get(track.id)?.connections || []), {
        names: [cc.name], characters: [], role: track.role,
        cc: { series: cc.series, number: cc.number },
        ...('variant' in track ? { variant: track.variant } : {}),
      }] });
    }
  }
  return result;
}
