import { spawnSync } from 'node:child_process';
import { readdir, mkdir, writeFile } from 'node:fs/promises';
const files = (await readdir('tests'))
  .filter((name) => name.endsWith('.test.ts'))
  .sort()
  .map((name) => `tests/${name}`);
const run = spawnSync(
  process.execPath,
  ['node_modules/tsx/dist/cli.mjs', '--test', '--test-reporter=tap', ...files],
  {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
  },
);
await mkdir('artifacts', { recursive: true });
const output = `${run.stdout || ''}\n${run.stderr || ''}`;
await writeFile('artifacts/unit-tests.tap', output);
const count = (label) => Number(output.match(new RegExp(`^# ${label} (\\d+)$`, 'm'))?.[1] ?? -1);
const report = {
  verifiedAt: new Date().toISOString(),
  tests: count('tests'),
  passed: count('pass'),
  failed: count('fail'),
  skipped: count('skipped'),
  exitCode: run.status,
};
await writeFile('artifacts/unit-results.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (run.status !== 0 || report.tests < 1 || report.passed !== report.tests) {
  console.error(output);
  process.exit(1);
}
