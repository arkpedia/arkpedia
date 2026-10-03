/*
 * The Techniques page against the game's own text. For every technique rule, who it finds in
 * the EN game tables (character_table traits and talents, skill_table with each level's values
 * filled in, battle_equip module stages 1 and 3) that the page, reading the operator records,
 * does not. A name here is a detail the page misses: a rule that cannot read the record's
 * wording, record text that differs from the game's, or a trait the page skipped.
 *
 *   ARKPEDIA_EN_EXCEL=<.../en/gamedata/excel> npx tsx scripts/audits/audit-techniques-vs-gamedata.ts
 *
 * Defaults to the stage pipeline's cache (npm run stages:refresh fills it), and skips without it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { detectAutoTechniqueMatches } from '../../lib/techniques/autoTechniques';
const GD = process.env.ARKPEDIA_EN_EXCEL ?? '.cache/upstream/en-gamedata/en/gamedata/excel';
if (!fs.existsSync(`${GD}/character_table.json`)) { console.log(`SKIPPED: no EN game tables at ${GD} (set ARKPEDIA_EN_EXCEL)`); process.exit(0); }
const ch = JSON.parse(fs.readFileSync(`${GD}/character_table.json`, 'utf8'));
const sk = JSON.parse(fs.readFileSync(`${GD}/skill_table.json`, 'utf8'));
const be = JSON.parse(fs.readFileSync(`${GD}/battle_equip_table.json`, 'utf8'));
const ue = JSON.parse(fs.readFileSync(`${GD}/uniequip_table.json`, 'utf8'));
const strip = (t: string | null | undefined) => (t || '').replace(/<[^>]+>/g, '');
function fill(text: string, bb: { key: string; value: number }[]) {
  const map = new Map(bb.map((b) => [b.key.toLowerCase(), b.value]));
  return text.replace(/\{(-?)([^}:]+)(?::([^}]*))?\}/g, (all, neg, key, fmt) => {
    let v = map.get(key.toLowerCase()); if (v === undefined) return all;
    if (neg) v = -v;
    if (fmt && fmt.includes('%')) return `${Math.round(v * 1000) / 10}%`;
    return String(Math.round(v * 100) / 100);
  });
}
const records: any[] = [];
for (const dir of fs.readdirSync('data').filter((d) => /^operators-\dstar$/.test(d))) for (const f of fs.readdirSync(path.join('data', dir))) records.push(JSON.parse(fs.readFileSync(path.join('data', dir, f), 'utf8')));
const byId = new Map(records.map((r) => [r.internalName, r]));
type Hit = { rule: string; source: string; text: string };
const names = (op: any, texts: string[], isTalent = false) => detectAutoTechniqueMatches(op.rarity, texts, op.name, op.branch, op.class, isTalent).filter((m) => !m.viaBranch).map((m) => m.name).filter((n): n is string => !!n);
// What the page sees, by rule.
function pageRules(op: any) {
  const set = new Set<string>();
  for (const t of (Array.isArray(op.talents) ? op.talents : [])) for (const row of (Array.isArray(t.rows) ? t.rows : [])) names(op, [row.description], true).forEach((n) => set.add(n));
  for (const s of (Array.isArray(op.skills?.skillList) ? op.skills.skillList : [])) for (const l of (Array.isArray(s.levels) ? s.levels : [])) names(op, [l.description]).forEach((n) => set.add(n));
  for (const m of (Array.isArray(op.modules) ? op.modules : [])) if (m.type === 'Upgrade') for (const st of (Array.isArray(m.stages) ? m.stages : [])) if ((st.stage === 'Stage 1' || st.stage === 'Stage 3') && st.effectText) names(op, [st.effectText], true).forEach((n) => set.add(n));
  // Traits, as buildTechniqueGroups reads them (not for what a trait does for others).
  const trait = !op.trait ? null : typeof op.trait === 'string' ? op.trait : Object.values(op.trait).join(' ; ');
  if (trait) names(op, [trait], true).filter((n) => !['Self-Sustain', 'SP Charging'].includes(n)).forEach((n) => set.add(n));
  // Branch-included rules count too.
  detectAutoTechniqueMatches(op.rarity, ['x'], op.name, op.branch, op.class).filter((m) => m.viaBranch && m.name).forEach((m) => set.add(m.name!));
  return set;
}
const missing: Record<string, { op: string; source: string; text: string }[]> = {};
const traitOnly: Record<string, string[]> = {};
let checked = 0;
for (const [cid, c] of Object.entries<any>(ch)) {
  if (!cid.startsWith('char_')) continue;
  const op = byId.get(cid); if (!op || op.isFuture) continue;
  checked++;
  const page = pageRules(op);
  const hits: Hit[] = [];
  for (const t of (Array.isArray(c.talents) ? c.talents : [])) for (const cand of (Array.isArray(t.candidates) ? t.candidates : [])) for (const n of names(op, [strip(cand.description)], true)) hits.push({ rule: n, source: 'talent', text: strip(cand.description) });
  for (const s of (Array.isArray(c.skills) ? c.skills : [])) { const sd = sk[s.skillId]; if (!sd) continue; for (const l of (Array.isArray(sd.levels) ? sd.levels : [])) { const text = fill(strip(l.description), l.blackboard || []); for (const n of names(op, [text])) hits.push({ rule: n, source: `skill ${sd.levels[0].name}`, text }); } }
  for (const [eid, eq] of Object.entries<any>(ue.equipDict)) {
    if (eq.charId !== cid || !be[eid]) continue;
    be[eid].phases.forEach((ph: any, i: number) => { if (i !== 0 && i !== 2) return; for (const part of ph.parts) {
      for (const cand of part.overrideTraitDataBundle?.candidates || []) { const text = strip(cand.overrideDescripton || cand.additionalDescription); for (const n of names(op, [text], true)) hits.push({ rule: n, source: `module ${eq.typeIcon.toUpperCase()} stage ${i + 1}`, text }); }
      for (const cand of part.addOrOverrideTalentDataBundle?.candidates || []) { const text = strip(cand.upgradeDescription || cand.description); for (const n of names(op, [text], true)) hits.push({ rule: n, source: `module ${eq.typeIcon.toUpperCase()} stage ${i + 1}`, text }); }
    } });
  }
  for (const h of hits) if (!page.has(h.rule)) { (missing[h.rule] ||= []); if (!missing[h.rule].some((x) => x.op === op.name)) missing[h.rule].push({ op: op.name, source: h.source, text: h.text.slice(0, 160) }); }
  // Trait text the page reads differently from the game's.
  const traitTexts = [strip(c.description), ...((c.trait?.candidates || []).map((x: any) => strip(x.overrideDescripton)))].filter(Boolean);
  for (const n of names(op, traitTexts, true)) if (!page.has(n) && !['Self-Sustain', 'SP Charging'].includes(n)) (traitOnly[n] ||= []).push(op.name);
}
console.log('operators checked', checked);
for (const [rule, list] of Object.entries(missing).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n## ${rule}: ${list.length} missing`);
  for (const m of list.slice(0, 12)) console.log(`  - ${m.op} [${m.source}] ${m.text}`);
  if (list.length > 12) console.log(`  ... +${list.length - 12} more: ${list.slice(12).map((m) => m.op).join(', ')}`);
}
console.log('\n## matched in the game\'s trait text but not on the page:');
for (const [rule, ops] of Object.entries(traitOnly)) console.log(`  ${rule}: ${ops.length} — ${[...new Set(ops)].slice(0, 15).join(', ')}`);
