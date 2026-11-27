import { approvePreviewSource } from '../../scripts/deploy/release-approval.mjs';
import { LIVE_ORIGIN, PREVIEW_ORIGIN, validCommit, type ReleaseCandidate } from './types';

const repo = 'arkpedia/arkpedia';
const repositoryId = 1455377998;
const prefix = 'repos/' + repo;

class GitHubError extends Error {
  constructor(readonly status: number) { super('GitHub returned HTTP ' + status + '.'); }
}

interface GitRepository { id?: number; full_name?: string }
interface PullRequest {
  number: number;
  state: string;
  draft: boolean;
  title: string;
  mergeable: boolean | null;
  merge_commit_sha: string | null;
  base: { ref: string; sha: string; repo: GitRepository };
  head: { sha: string; repo: GitRepository | null };
}

interface GitCommit { sha: string; tree: { sha: string }; parents: { sha: string }[] }

export function releaseGateway(token?: string, request: typeof fetch = fetch) {
  async function github<T>(path: string, init?: RequestInit): Promise<T> {
    if (!path.startsWith(prefix + '/')) throw Error('Unexpected release repository.');
    const response = await request('https://api.github.com/' + path, {
      ...init,
      headers: {
        accept: 'application/vnd.github+json', 'user-agent': 'arkpedia-release-queue',
        'x-github-api-version': '2022-11-28', ...(token && { authorization: 'Bearer ' + token }),
        ...(init?.body && { 'content-type': 'application/json' }),
      },
      redirect: 'manual', signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new GitHubError(response.status);
    return response.json() as Promise<T>;
  }

  async function identity(role: 'production' | 'staging') {
    const response = await request((role === 'production' ? LIVE_ORIGIN : PREVIEW_ORIGIN) + '/build-info.json', {
      headers: { 'cache-control': 'no-cache' }, redirect: 'manual', signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw Error('The build identity could not be read.');
    const info = await response.json() as { version: number; dirty: boolean; deploymentRole: string; commit: string; codeFingerprint: string };
    if (info.version !== 1 || info.dirty !== false || !validCommit(info.commit) ||
        info.deploymentRole !== role || !/^[a-f0-9]{64}$/.test(info.codeFingerprint)) throw Error('The build identity could not be verified.');
    return { source: info.commit, fingerprint: info.codeFingerprint };
  }

  async function main() {
    const result = await github<{ commit: { sha: string } }>(prefix + '/branches/main');
    if (!validCommit(result.commit.sha)) throw Error('Could not verify main.');
    return result.commit.sha;
  }

  async function review(pullRequest: number, paths: string[]) {
    const [preview, pr, base] = await Promise.all([
      identity('staging'), github<PullRequest>(prefix + '/pulls/' + pullRequest), main(),
    ]);
    const ours = (entry: GitRepository | null) => entry?.id === repositoryId && entry.full_name === repo;
    if (pr.number !== pullRequest || !ours(pr.base.repo) || !ours(pr.head.repo) || pr.base.ref !== 'main' ||
        pr.base.sha !== base || pr.head.sha !== preview.source || pr.state !== 'open' || pr.draft) {
      throw Error('Preview must match the open, ready pull request against current main.');
    }
    await approvePreviewSource(preview.source, path => github(path));
    const candidate: ReleaseCandidate = { ...preview, base, pullRequest, title: pr.title, paths };
    // GitHub computes the test merge while the PR is open. Its parentage and tree
    // must match the reviewed candidate before it is eligible for a ref update.
    if (!pr.mergeable || !validCommit(pr.merge_commit_sha)) throw Error('GitHub has not confirmed an exact merge. Try again after the pull request is ready.');
    const [source, target] = await Promise.all([
      github<GitCommit>(prefix + '/git/commits/' + preview.source),
      github<GitCommit>(prefix + '/git/commits/' + pr.merge_commit_sha),
    ]);
    if (source.sha !== candidate.source || target.sha !== pr.merge_commit_sha || target.tree.sha !== source.tree.sha ||
        target.parents.length !== 2 || target.parents[0].sha !== base || target.parents[1].sha !== candidate.source) {
      throw Error('The merge tree differs from the reviewed Preview. Update the pull request and deploy it to Preview again.');
    }
    return { candidate, target: target.sha };
  }

  async function advance(target: string) {
    if (!token) throw Error('Production release credentials are unavailable.');
    const updated = await github<{ object: { sha: string } }>(prefix + '/git/refs/heads/main', {
      method: 'PATCH', body: JSON.stringify({ sha: target, force: false }),
    });
    if (updated.object.sha !== target) throw Error('GitHub did not confirm the reviewed commit.');
  }

  async function deployment(source: string): Promise<'pending' | 'success' | 'failed'> {
    const name = 'Workers Builds: arkpedia';
    const { check_runs } = await github<{ check_runs: {
      id: number; name: string; head_sha: string; app: { id: number } | null; status: string; conclusion: string | null;
    }[] }>(prefix + '/commits/' + source + '/check-runs?filter=latest&check_name=' + encodeURIComponent(name));
    const latest = check_runs.filter(check => check.name === name && check.head_sha === source && check.app?.id === 85455)
      .sort((left, right) => right.id - left.id)[0];
    if (latest?.status !== 'completed') return 'pending';
    return latest.conclusion === 'success' ? 'success' : 'failed';
  }

  const rejected = (error: unknown) => error instanceof GitHubError && [401, 403, 404, 409, 422].includes(error.status);
  return { review, advance, deployment, rejected, main, identity, enabled: !!token };
}

export type ReleaseGateway = ReturnType<typeof releaseGateway>;
