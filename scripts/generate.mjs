// Builds README.md from Hey Research Lab's open dataset (CC BY 4.0): every Verified Builder on HEY whose activity
// status is Shipping or Active, grouped by primary narrative, ordered by name. No dependencies; Node 20+.
//   node scripts/generate.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const DATA = 'https://heyresearch.xyz/data/latest/';
const UA = { 'user-agent': 'awesome-robinhood-chain (+https://github.com/hey-research-lab/awesome-robinhood-chain)' };
const BUILDING = new Set(['SHIPPING', 'ACTIVE']);
const MIN_IN_SECTION = 5;

const get = async (path) => {
  const res = await fetch(DATA + path, { headers: UA });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res;
};
const meta = await (await get('metadata.json')).json();
const ndjson = gunzipSync(Buffer.from(await (await get('projects.ndjson.gz')).arrayBuffer())).toString('utf8');
const projects = ndjson.split('\n').filter(Boolean).map((line) => JSON.parse(line));

// One line of plain text: no markup a description could smuggle in, no line breaks, at most 140 characters.
const clean = (text) => {
  const flat = String(text ?? '').replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, ' ').replace(/[<>`*_[\]|\\]/g, '').replace(/\s+/g, ' ').trim();
  if (!flat) return '';
  const cut = flat.length > 140 ? `${flat.slice(0, 139).replace(/\s+\S*$/, '')}…` : flat;
  return /[.!?…]$/.test(cut) ? cut : `${cut}.`;
};
const day = (iso) => (iso ? String(iso).slice(0, 10) : null);
const anchor = (title) => title.toLowerCase().replace(/[^a-z0-9 -]/g, '').trim().replace(/\s+/g, '-');

// A one-line description of its own too: an entry a reader cannot place is a name, not a lead.
const listed = projects.filter((p) => p.catalogStatus === 'VERIFIED_BUILDER' && BUILDING.has(p.activityStatus) && p.slug && p.name && clean(p.shortDescription).length >= 30);
const groups = new Map();
for (const p of listed) {
  const key = p.primaryNarrative?.name || 'More builders';
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(p);
}
// Small narratives share one section, so every heading holds a real list.
const more = groups.get('More builders') ?? [];
for (const [key, list] of [...groups]) if (key !== 'More builders' && list.length < MIN_IN_SECTION) { more.push(...list); groups.delete(key); }
if (more.length) groups.set('More builders', more);
const order = [...groups.keys()].filter((k) => k !== 'More builders').sort((a, b) => a.localeCompare(b));
if (groups.has('More builders')) order.push('More builders');

const entry = (p) => {
  const desc = clean(p.shortDescription);
  const shipped = day(p.lastShippedAt);
  const status = p.activityStatus === 'SHIPPING' ? 'Shipping' : 'Active';
  const ticker = p.symbol ? ` · $${String(p.symbol).replace(/[^A-Za-z0-9.]/g, '').slice(0, 12).toUpperCase()}` : '';
  return `- [${clean(p.name).replace(/\.$/, '')}](https://heyresearch.xyz/project/${encodeURIComponent(p.slug)})${ticker} — ${desc} *${status}${shipped ? `, last shipped ${shipped}` : ''}.*`;
};

const sections = order.map((key) => {
  const list = groups.get(key).sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
  return `## ${key}\n\n${list.map(entry).join('\n')}\n`;
});
const contents = order.map((key) => `- [${key}](#${anchor(key)}) (${groups.get(key).length})`).join('\n');

const template = readFileSync(new URL('../template.md', import.meta.url), 'utf8');
const out = template
  .replace('{{COUNT}}', listed.length.toLocaleString('en-US'))
  .replace('{{DAY}}', meta.day)
  .replace('{{CONTENTS}}', contents)
  .replace('{{SECTIONS}}', sections.join('\n'));
for (const word of [/\bbuy\b/i, /\bscam/i, /Hood Chain/, /tokenized stocks/i]) if (word.test(template)) throw new Error(`template wording: ${word}`);
writeFileSync(new URL('../README.md', import.meta.url), out);
console.log(`README.md: ${listed.length} builders in ${order.length} sections, dataset day ${meta.day}`);
