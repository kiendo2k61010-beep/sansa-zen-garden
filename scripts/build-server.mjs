import { build } from 'esbuild';

// Bundle our TypeScript and shared world rules; runtime packages stay in node_modules.
await build({
  entryPoints: ['server/index.ts'],
  outfile: 'dist-server/index.mjs',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  packages: 'external',
  sourcemap: true,
  logLevel: 'info',
});
