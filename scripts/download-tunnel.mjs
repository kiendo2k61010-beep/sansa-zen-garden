import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const response = await fetch('https://api.github.com/repos/cloudflare/cloudflared/releases/latest', {
  headers: { 'User-Agent': 'SANSA-build' },
});
if (!response.ok) throw Error(`GitHub release ${response.status}`);
const release = await response.json();
const asset = release.assets.find((a) => a.name === 'cloudflared-windows-amd64.exe');
if (!asset?.digest?.startsWith('sha256:')) throw Error('Official SHA256 digest missing; refusing binary');
const download = await fetch(asset.browser_download_url);
if (!download.ok) throw Error(`Download ${download.status}`);
const buffer = Buffer.from(await download.arrayBuffer());
const hash = createHash('sha256').update(buffer).digest('hex');
if (asset.digest !== `sha256:${hash}`) throw Error('SHA256 mismatch');
await mkdir('.tools', { recursive: true });
await writeFile('.tools/cloudflared.exe', buffer);
await writeFile(
  '.tools/cloudflared-source.json',
  JSON.stringify({ release: release.tag_name, url: asset.browser_download_url, sha256: hash }, null, 2),
);
console.log(JSON.stringify({ release: release.tag_name, sha256: hash, bytes: buffer.length }));
