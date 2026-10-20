import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const shaPattern = /^[a-f0-9]{40}$/;
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const usage = 'Usage: node scripts/release.mjs [--dry-run | --help]\n';

function stable(version) {
  if (typeof version !== 'string' || !versionPattern.test(version)) throw Error('Expected stable semver X.Y.Z.');
  return version.split('.').map(BigInt);
}
function greater(next, previous) {
  return next.some((part, index) => part > previous[index] && next.slice(0, index).every((n, i) => n === previous[i]));
}

// gh api -i exposes the HTTP status on success; gh writes are a separate command.
export async function systemGh(args) {
  try {
    const output = execFileSync('gh', args[0] === 'api' ? ['api', '-i', ...args.slice(1)] : args, { encoding: 'utf8' });
    if (args[0] !== 'api') return { status: 0, stdout: output };
    const match = output.match(/^HTTP\/\S+ (\d{3})[^\n]*\r?\n[\s\S]*?\r?\n\r?\n([\s\S]*)$/m);
    if (!match) throw Error('Unable to parse gh API response.');
    return { status: Number(match[1]), body: JSON.parse(match[2]) };
  } catch (error) {
    // gh reports a 404 on stderr with a nonzero process status. Only that exact
    // HTTP status is absence; a 403, transport failure or malformed response fails.
    if (args[0] === 'api' && /\bHTTP 404\b/.test(String(error.stderr ?? ''))) return { status: 404 };
    throw Error(String(error.stderr ?? error.message).trim());
  }
}

async function api(gh, path, optional = false) {
  const response = await gh(['api', path]);
  if (optional && response.status === 404) return null;
  if (response.status !== 200) throw Error(`GitHub API ${path}: HTTP ${response.status}`);
  return response.body;
}

async function tagCommit(gh, repo, object) {
  for (let depth = 0; depth < 5; depth++) {
    if (!object || !shaPattern.test(object.sha)) throw Error('Invalid tag object.');
    if (object.type === 'commit') return object.sha;
    if (object.type !== 'tag') throw Error('Unsupported tag object.');
    object = (await api(gh, `repos/${repo}/git/tags/${object.sha}`)).object;
  }
  throw Error('Tag nesting limit exceeded.');
}

export async function runRelease({ event, sha, version, gh = systemGh, dryRun = false }) {
  if (!shaPattern.test(sha ?? '') || event?.after !== sha || event?.ref !== 'refs/heads/main' ||
      event?.created || !shaPattern.test(event?.before ?? '') ||
      event?.repository?.full_name !== 'luismarinoc/calc3d') {
    throw Error('Invalid main push or immutable SHA.');
  }
  if (/^0{40}$/.test(event.before)) throw Error('Bootstrap push cannot release.');
  const repo = event.repository.full_name;
  const next = stable(version);
  const oldFile = await api(gh, `repos/${repo}/contents/package.json?ref=${event.before}`);
  if (oldFile.encoding !== 'base64' || typeof oldFile.content !== 'string') throw Error('Invalid previous package.json response.');
  const previous = stable(JSON.parse(Buffer.from(oldFile.content.replace(/\s/g, ''), 'base64').toString('utf8')).version);
  if (next.every((part, index) => part === previous[index])) return `Version unchanged (${version}); no release`;
  if (!greater(next, previous)) throw Error('Version must increase.');
  const tagName = `v${version}`;
  let prs = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await api(gh, `repos/${repo}/commits/${sha}/pulls?per_page=100&page=${page}`);
    if (!Array.isArray(batch) || batch.length > 100) throw Error('Invalid associated PR response.');
    prs = prs.concat(batch);
    if (batch.length < 100) break;
    if (page === 10) throw Error('Associated PR pagination limit exceeded.');
  }
  if (prs.length !== 1 || prs[0].title !== `chore(release): ${tagName}` || !prs[0].merged_at ||
      prs[0].merge_commit_sha !== sha || prs[0].base?.ref !== 'main' ||
      prs[0].base?.repo?.full_name !== repo || prs[0].head?.repo?.full_name !== repo) {
    throw Error('Not an eligible merged version PR.');
  }
  const release = await api(gh, `repos/${repo}/releases/tags/${tagName}`, true);
  const tag = await api(gh, `repos/${repo}/git/ref/tags/${tagName}`, true);
  if (tag && await tagCommit(gh, repo, tag.object) !== sha) throw Error('Tag target conflict.');
  if (release) {
    if (!tag) throw Error('Existing release has missing tag.');
    if (release.tag_name !== tagName || release.target_commitish !== sha) throw Error('Release target conflict.');
    return `Release ${tagName} already exists at ${sha}`;
  }
  if (dryRun) return `Would create release ${tagName} at ${sha}`;
  await gh(['release', 'create', tagName, '--repo', repo, '--target', sha, '--title', tagName, '--generate-notes']);
  return `Created release ${tagName} at ${sha}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') process.stdout.write(usage);
  else if (args.some(arg => arg !== '--dry-run') || args.length > 1) {
    process.stderr.write(`Unknown option: ${args.find(arg => arg !== '--dry-run') ?? args.join(' ')}\n`);
    process.exitCode = 1;
  } else {
    try {
      const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
      const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
      console.log(await runRelease({ event, sha: process.env.GITHUB_SHA, version, dryRun: args[0] === '--dry-run' }));
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
