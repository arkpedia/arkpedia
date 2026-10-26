// Provider environment and exact single-version validation shared by live releases.
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const requireValue = (value, message) => { if (!value) throw new Error(`Worker provider refused: ${message}`); };

export function providerEnvironment(source = process.env) {
  const environment = {};
  for (const name of ['PATH', 'Path', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TMP', 'TEMP',
    'TMPDIR', 'SystemRoot', 'SYSTEMROOT', 'COMSPEC', 'XDG_CONFIG_HOME', 'CLOUDFLARE_API_TOKEN']) {
    if (source[name] !== undefined) environment[name] = source[name];
  }
  return { ...environment, CLOUDFLARE_ACCOUNT_ID: '1ff51c10571eaa9934bc451e1bfdb361', CI: 'true',
    OPEN_NEXT_DEPLOY: 'true', WRANGLER_SEND_METRICS: 'false' };
}

export function latestWorkerVersion(deployments) {
  requireValue(Array.isArray(deployments) && deployments.length > 0, 'missing deployment inventory');
  requireValue(deployments.every(item => UUID.test(item?.id ?? '') && Number.isFinite(Date.parse(item.created_on))),
    'invalid deployment history');
  const sorted = [...deployments].sort((a,b) => Date.parse(b.created_on) - Date.parse(a.created_on));
  requireValue(sorted.length < 2 || Date.parse(sorted[0].created_on) > Date.parse(sorted[1].created_on),
    'ambiguous current deployment');
  const versions = sorted[0].versions;
  requireValue(Array.isArray(versions) && versions.length === 1 && versions[0].percentage === 100
    && UUID.test(versions[0].version_id ?? ''), 'Worker must serve exactly one known version');
  return versions[0].version_id;
}
