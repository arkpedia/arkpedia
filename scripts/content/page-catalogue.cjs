const fs = require('node:fs');
const path = require('node:path');

function pageFiles(root, dir = 'pages') {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(entry => {
    const file = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return file === 'pages/api' ? [] : pageFiles(root, file);
    return /\.[jt]sx?$/.test(entry.name) && !/^_/.test(entry.name) ? [file] : [];
  }).sort();
}

function loadPageCatalogue(root = path.resolve(__dirname, '../..')) {
  const entries = [];
  const releaseKeys = new Set();
  const aliases = JSON.parse(fs.readFileSync(path.join(root, 'config/pilot-route-aliases.json'), 'utf8')).routes;
  for (const file of pageFiles(root)) {
    const stem = file.replace(/\.[jt]sx?$/, '');
    const route = stem.slice('pages'.length).replace(/\/index$/, '') || '/';
    const sidecar = path.join(root, `${stem}.route.json`);
    if (!fs.existsSync(sidecar)) throw Error(`Missing ${stem}.route.json`);
    const policy = JSON.parse(fs.readFileSync(sidecar, 'utf8'));
    if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
      throw Error(`${stem}.route.json must be an object`);
    }
    const { release, sitemap, tables, regional, clock, serverDay, outsideRelease, nav } = policy;
    const key = release === true ? route : release;
    if (key !== undefined) {
      if (typeof key !== 'string' || (key !== route && aliases[key] !== route) || releaseKeys.has(key)) {
        throw Error(`${stem}.route.json has an invalid or duplicate release key: ${key}`);
      }
      releaseKeys.add(key);
    }
    if ((!key && !sitemap) || (sitemap !== undefined && !['static', 'exclude', 'omit'].includes(sitemap))
        || ((tables || regional || clock || serverDay) && !key)
        || (tables !== undefined && (!Array.isArray(tables) || tables.some(name => typeof name !== 'string' || !name)
          || new Set(tables).size !== tables.length || tables.includes('regional-schedules')))
        || (regional !== undefined && regional !== true)
        || (clock !== undefined && !['minute', 'second'].includes(clock))
        || (serverDay !== undefined && (serverDay !== true || !clock))
        || (outsideRelease !== undefined && (key || typeof outsideRelease !== 'string' || !outsideRelease.trim()))) {
      throw Error(`${stem}.route.json has an invalid page policy`);
    }
    const fields = ['release', 'sitemap', 'tables', 'regional', 'clock', 'serverDay', 'outsideRelease', 'nav'];
    const unknown = Object.keys(policy).filter(field => !fields.includes(field));
    if (unknown.length) throw Error(`${stem}.route.json has unknown fields: ${unknown.join(', ')}`);
    if (nav !== undefined && (!Array.isArray(nav) || nav.some(item => !item
      || !Number.isFinite(item.order) || !item.group || !item.label || !item.icon
      || (item.query !== undefined && (typeof item.query !== 'string' || /^[?#]/.test(item.query)))))) {
      throw Error(`${stem}.route.json has an invalid nav entry`);
    }
    entries.push({ route, file, key, sitemap, tables, regional, clock, serverDay, outsideRelease, nav });
  }
  return entries;
}

module.exports = { loadPageCatalogue };
