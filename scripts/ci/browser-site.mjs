// Immutable, same-run fixture site shared by browser runners. No credentials or caches travel.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const ARCHIVE = '.cache/browser-site.tgz', MANIFEST = '.cache/browser-site-manifest.json';
const FILES = ['.next','data','public','.cache/browser-plan.json','.cache/browser-shards-plan.json','.cache/native-media-delivery.json'];
const sha = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const git = args => execFileSync('git',args,{encoding:'utf8'}).trim();
const requireValue = (value,message) => {if (!value) throw Error(message);};

export function validateSiteManifest(manifest, identity, archiveSha256) {
  requireValue(manifest?.schema === 1 && /^[a-f0-9]{64}$/.test(archiveSha256), 'Invalid browser site manifest');
  for (const key of ['commit','tree','runId','lockSha256','pinSha256'])
    requireValue(identity[key] !== undefined && manifest[key] === identity[key], 'Browser site identity differs: '+key);
  requireValue(manifest.archiveSha256 === archiveSha256, 'Browser site archive checksum differs');
}
export function safeArchiveEntry(entry) {
  if (typeof entry !== 'string' || !entry || entry.startsWith('/') || entry.includes('\\') || entry.split('/').some(p => p === '..')) return false;
  const name = entry.replace(/\/$/,'');
  return FILES.some(root => name === root || name.startsWith(root+'/'))
    && !/^\.next\/(?:cache|standalone)(?:\/|$)/.test(name);
}
function identity() {
  const runId = Number(process.env.GITHUB_RUN_ID);
  requireValue(Number.isSafeInteger(runId) && runId>0,'Missing browser build run');
  return {commit:git(['rev-parse','HEAD']),tree:git(['rev-parse','HEAD^{tree}']),runId,
    lockSha256:sha('package-lock.json'),pinSha256:sha('tests/browser/data-pin.json')};
}
function ordinary(file) {
  if (/^\.next\/(?:cache|standalone)(?:\/|$)/.test(file)) return;
  const stat=fs.lstatSync(file);
  requireValue(!stat.isSymbolicLink(),'Browser bundle cannot contain symbolic links: '+file);
  if(stat.isDirectory()) for(const name of fs.readdirSync(file)) ordinary(path.join(file,name));
  else requireValue(stat.isFile(),'Browser bundle contains a special file: '+file);
}
function main() {
  if(process.argv[2]==='pack'){
    for(const file of FILES) ordinary(file);
    execFileSync('tar',['--hard-dereference','--exclude=.next/cache','--exclude=.next/standalone','-czf',ARCHIVE,...FILES],{stdio:'inherit'});
    fs.writeFileSync(MANIFEST,JSON.stringify({schema:1,...identity(),archiveSha256:sha(ARCHIVE)}));
    console.log('Packed source-bound browser site ('+fs.statSync(ARCHIVE).size+' bytes)');return;
  }
  if(process.argv[2]==='restore'){
    validateSiteManifest(JSON.parse(fs.readFileSync(MANIFEST,'utf8')),identity(),sha(ARCHIVE));
    const entries=execFileSync('tar',['-tzf',ARCHIVE],{encoding:'utf8',maxBuffer:16_000_000}).trim().split('\n');
    requireValue(entries.length>0 && entries.every(safeArchiveEntry),'Unsafe browser site archive path');
    const types=execFileSync('tar',['-tvzf',ARCHIVE],{encoding:'utf8',maxBuffer:16_000_000}).trim().split('\n');
    requireValue(types.every(line=>/^[-d]/.test(line)),'Browser site archive contains a link or special file');
    execFileSync('tar',['-xzf',ARCHIVE,'--no-same-owner','--no-same-permissions'],{stdio:'inherit'});
    console.log('Restored exact-source browser site');return;
  }
  throw Error('Use pack or restore');
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  try{main();}catch(error){console.error(error.message);process.exitCode=1;}
}
