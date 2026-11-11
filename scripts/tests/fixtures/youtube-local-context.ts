import { loadVideoDiscoveryContext } from '../../../lib/music/youtubeContextServer';

// The content workflow invokes a standalone TypeScript entry, not a test module.
void loadVideoDiscoveryContext(Date.parse(process.argv[2]), true).then(context => {
  console.log(JSON.stringify(context));
}).catch(error => { console.error(error); process.exitCode = 1; });
