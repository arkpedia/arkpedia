import { pathToFileURL } from 'node:url';

export function assertBuildPolicy(project) {
  if (project.link != null) throw new Error('Disconnect the Vercel project Git repository: deployments must come from the NAS.');
  if (project.commandForIgnoringBuildStep !== 'exit 0') {
    throw new Error('Set the Vercel project Ignored Build Step to "exit 0" to block independent builds.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { VERCEL_TOKEN, VERCEL_PROJECT_ID, VERCEL_ORG_ID } = process.env;
    if (!VERCEL_TOKEN || !VERCEL_PROJECT_ID || !VERCEL_ORG_ID) throw new Error('Missing Vercel project credentials.');
    const url = new URL(`https://api.vercel.com/v9/projects/${encodeURIComponent(VERCEL_PROJECT_ID)}`);
    url.searchParams.set('teamId', VERCEL_ORG_ID);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${VERCEL_TOKEN}` }, signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Cannot verify Vercel build policy (HTTP ${response.status}).`);
    assertBuildPolicy(await response.json());
    console.log('Vercel Git builds disconnected; independent builds disabled.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
