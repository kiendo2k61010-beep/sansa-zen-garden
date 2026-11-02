import { createTempleServer } from './app.ts';

const port = Number(process.env.PORT || 3001);
const server = createTempleServer();
server
  .listen(port, process.env.HOST || '0.0.0.0')
  .then((actualPort) => {
    console.log(
      JSON.stringify({
        event: 'server_started',
        service: 'sansa-zen-garden',
        port: actualPort,
        mode: process.env.NODE_ENV || 'development',
        maxConnections: Number(process.env.MAX_CONNECTIONS) || 240,
      }),
    );
    console.log(`SANSA Zen Garden server: http://localhost:${actualPort}`);
    console.log('Region labels partition rooms; this server does not claim geographic multi-region hosting.');
  })
  .catch((error) => {
    console.error('Cannot start temple server:', error);
    process.exitCode = 1;
  });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}
