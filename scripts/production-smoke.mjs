import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { io } from 'socket.io-client';

const child = spawn(process.execPath, ['dist-server/index.mjs'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: 'production',
    HOST: '127.0.0.1',
    PORT: '0',
    PUBLIC_ORIGIN: '',
    ALLOWED_ORIGINS: '',
  },
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});
const clients = [];
let stderr = '';
child.stderr.on('data', (data) => {
  stderr += String(data);
});
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const request = (socket, event, payload) =>
  new Promise((resolve, reject) => {
    socket
      .timeout(4000)
      .emit(event, payload, (error, response) => (error ? reject(error) : resolve(response)));
  });
try {
  const port = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Server start timeout')), 10000);
    child.once('error', reject);
    child.once('exit', (code) => reject(new Error(`Server exited ${code}: ${stderr}`)));
    child.stdout.on('data', (data) => {
      output += String(data);
      for (const line of output.split(/\r?\n/)) {
        if (!line.startsWith('{')) continue;
        const event = JSON.parse(line);
        if (event.event === 'server_started') {
          clearTimeout(timer);
          resolve(event.port);
        }
      }
    });
  });
  const url = `http://127.0.0.1:${port}`;
  const page = await fetch(`${url}/?room=an-nhien&instance=0&region=apac`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<div id="root"><\/div>/);
  assert.equal((await fetch(`${url}/room/direct-refresh?room=an-nhien`)).status, 200);
  assert.equal(page.headers.get('referrer-policy'), 'no-referrer');
  const room = { room: 'an-nhien', instance: 0, region: 'apac' };
  const bases = [];
  let snapshots = 0;
  let snapshotBytes = 0;
  for (let index = 0; index < 20; index++) {
    const socket = io(url, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      extraHeaders: { Origin: url },
    });
    clients.push(socket);
    await new Promise((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    const joined = await request(socket, 'join', {
      ...room,
      name: `Load ${index}`,
      avatar: index % 2 ? 'sage' : 'dck',
      sessionId: `prod-smoke-${index}`,
    });
    assert.equal(joined.ok, true);
    bases.push(joined.snapshot.players.find((player) => player.id === socket.id));
  }
  clients.forEach((socket) =>
    socket.on('snapshot', (snapshot) => {
      assert.equal(snapshot.players.length, 20);
      snapshots++;
      snapshotBytes += Buffer.byteLength(JSON.stringify(snapshot));
    }),
  );
  const times = [];
  const start = performance.now();
  let acceptedPoses = 0;
  for (let tick = 0; tick < 35; tick++) {
    await delay(100);
    await Promise.all(
      clients.map(async (socket, index) => {
        const begin = performance.now();
        const pose = {
          x: bases[index].x + Math.sin(tick / 5) * 0.45,
          z: bases[index].z,
          rotation: tick / 10,
          action: index % 2 ? 'run' : 'walk',
        };
        const response = await request(socket, 'pose', pose);
        assert.equal(response.ok, true);
        acceptedPoses++;
        times.push(performance.now() - begin);
      }),
    );
  }
  const elapsedMs = performance.now() - start;
  times.sort((a, b) => a - b);
  const health = await fetch(`${url}/api/health`).then((response) => response.json());
  assert.equal(health.players, 20);
  assert.equal(health.connections, 20);
  assert.equal(health.counters.rejectedPoses, 0);
  clients.forEach((socket) => socket.removeAllListeners('snapshot'));
  const created = await request(clients[0], 'create-room', {
    room: 'production-private',
    visibility: 'private',
    region: 'apac',
    instance: 0,
  });
  assert.equal(created.ok, true);
  assert.equal((await request(clients[0], 'join', { ...created.room, sessionId: 'prod-smoke-0' })).ok, true);
  assert.equal((await request(clients[1], 'join', { ...created.room, sessionId: 'prod-smoke-1' })).ok, true);
  assert.equal(
    (
      await request(clients[2], 'join', {
        room: created.room.room,
        instance: 0,
        region: 'apac',
        sessionId: 'prod-smoke-2',
      })
    ).ok,
    false,
  );
  assert.equal((await request(clients[0], 'chat:send', { text: 'Bình an' })).ok, true);
  assert.equal((await request(clients[1], 'chat:history', {})).messages[0].text, 'Bình an');
  assert.equal((await request(clients[2], 'chat:history', {})).messages.length, 0);
  const listed = await fetch(`${url}/api/rooms`).then((response) => response.json());
  assert.ok(!listed.some((item) => item.room === 'production-private'));
  const report = {
    verifiedAt: new Date().toISOString(),
    build: 'dist-server/index.mjs + dist frontend',
    nodeVersion: process.version,
    mode: 'production',
    localOnly: true,
    checks: {
      frontend200: true,
      directRefresh200: true,
      sameOriginWebSocket: true,
      privateInvite: true,
      privateRoomHidden: true,
      roomChatIsolation: true,
    },
    load: {
      realSocketClients: 20,
      elapsedMs: Math.round(elapsedMs),
      acceptedPoses,
      rejectedPoses: 0,
      snapshotsReceived: snapshots,
      snapshotJsonBytes: snapshotBytes,
      snapshotKBPerSecondPerClient: +(snapshotBytes / 1024 / (elapsedMs / 1000) / 20).toFixed(2),
      poseAckMedianMs: +times[Math.floor(times.length / 2)].toFixed(2),
      poseAckP95Ms: +times[Math.floor(times.length * 0.95)].toFixed(2),
      serverRssMB: health.memoryMB,
    },
    limitations: [
      'Loopback clients on the same PC, not WAN users.',
      'JSON payload bytes exclude Socket.IO/WebSocket/TLS overhead.',
      'No rendering/FPS, GPU or server CPU measurement in this test.',
    ],
  };
  await writeFile('artifacts/production-server-report.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  clients.forEach((socket) => socket.disconnect());
  child.kill();
}
