import { mkdir, copyFile } from 'node:fs/promises';
const packages = [
  '@fontsource/be-vietnam-pro',
  '@fontsource-variable/noto-serif',
  'lucide-react',
  'three',
  'react',
  'react-dom',
  'socket.io-client',
];
await mkdir('public/licenses', { recursive: true });
for (const name of packages)
  await copyFile(
    `node_modules/${name}/LICENSE`,
    `public/licenses/${name.replaceAll('/', '-').replaceAll('@', '')}.txt`,
  );
console.log(`Copied ${packages.length} original dependency license notices.`);
