// Directory overrides precede broad folder redirects. Match a single filename:
// descendants have their own directory identity, never inherit a parent's alias.
function mediaRedirects(maps, pins, folders, template) {
  const output = [];
  for (const repository of ['arkpedia-image-assets', 'arkpedia-skin-assets']) {
    const map = maps[repository]?.[pins[repository]];
    if (!map) continue;
    for (const [group, revision] of Object.entries(map.overrides)) {
      const destination = template.replace('{repository}', repository).replace('{revision}', revision).replace('{path}', `${group.split('/').map(encodeURIComponent).join('/')}/:file`);
      const aliases = folders[repository].includes(group.split('/')[0]) ? [group] : [];
      if (repository === 'arkpedia-skin-assets') {
        if (group === 'originals' || group.startsWith('originals/')) aliases.push(group.replace(/^originals/, 'skin-originals'));
        if (group === 'variants' || group.startsWith('variants/')) aliases.push(group.replace(/^variants/, 'skin-variants'));
      }
      for (const alias of aliases) output.push({ source: `/${alias.replace(/[()[\]{}+?*:$\\]/g, '\\$&')}/:file`, destination, permanent: false });
    }
  }
  return output;
}
module.exports = { mediaRedirects };
