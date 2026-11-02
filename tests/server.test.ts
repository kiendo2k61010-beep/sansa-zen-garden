import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { io, type Socket } from 'socket.io-client';
import { createTempleServer } from '../server/app.ts';
import { SEATS, INTERACTION_POINTS, type Ack, type Snapshot, type WorldEvent } from '../shared/world.ts';

let server: ReturnType<typeof createTempleServer>;
let url: string;
let clients: Socket[];
const room = { room: 'an-nhien', instance: 0, region: 'apac' };
beforeEach(async () => {
  server = createTempleServer();
  url = `http://127.0.0.1:${await server.listen()}`;
  clients = [];
});
afterEach(async () => {
  clients.forEach((client) => client.disconnect());
  await server.close();
});

async function client() {
  const socket = io(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  clients.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  return socket;
}
function emit(socket: Socket, event: string, payload?: unknown): Promise<Ack> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} acknowledgement timeout`)), 2000);
    const callback = (ack: Ack) => {
      clearTimeout(timer);
      resolve(ack);
    };
    if (payload === undefined) socket.emit(event, callback);
    else socket.emit(event, payload, callback);
  });
}
const join = (socket: Socket, overrides = {}) =>
  emit(socket, 'join', { ...room, name: 'Mây an nhiên', color: '#b97847', ...overrides });
function snapshotWhere(socket: Socket, predicate: (snapshot: Snapshot) => boolean): Promise<Snapshot> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('snapshot', listener);
      reject(new Error('Snapshot condition timeout'));
    }, 2500);
    const listener = (snapshot: Snapshot) => {
      if (predicate(snapshot)) {
        clearTimeout(timer);
        socket.off('snapshot', listener);
        resolve(snapshot);
      }
    };
    socket.on('snapshot', listener);
  });
}
async function approach(socket: Socket) {
  const seat = SEATS[8];
  // Arrange server state directly for seat tests; production exposes no teleport event.
  positionFixture(socket, seat.x, seat.z + 0.9);
  const response = await emit(socket, 'pose', {
    x: seat.x,
    z: seat.z + 0.7,
    rotation: Math.PI,
    action: 'walk',
    actionAt: 0,
  });
  assert.equal(response.ok, true);
  return seat;
}
function positionFixture(socket: Socket, x: number, z: number) {
  const player = [...server.rooms.values()]
    .flatMap((state) => [...state.players.values()])
    .find((item) => item.id === socket.id);
  assert.ok(player);
  Object.assign(player, { x, z });
}

test('real clients receive movement, personalized snapshots, greetings and server timestamps', async () => {
  const first = await client();
  const second = await client();
  const a = await join(first, { name: 'Mây' });
  const b = await join(second, { name: 'Gió' });
  assert.equal(a.snapshot?.selfId, first.id);
  assert.equal(b.snapshot?.selfId, second.id);
  positionFixture(first, 2.8, 13);
  const moved = snapshotWhere(second, (state) =>
    state.players.some((player) => player.id === first.id && player.x === 3 && player.action === 'walk'),
  );
  await emit(first, 'pose', { x: 3, z: 13, rotation: 1.2, action: 'walk', actionAt: 1 });
  const movement = await moved;
  assert.equal(movement.players.length, 2);
  assert.equal(movement.room.count, 2);
  const greetEvent = new Promise<{ id: string; name: string }>((resolve) => second.once('greet', resolve));
  const action = await emit(first, 'action', { action: 'greet' });
  assert.equal((await greetEvent).id, first.id);
  assert.equal(action.snapshot?.players.find((player) => player.id === first.id)?.action, 'greet');
  assert.ok(action.snapshot!.players.find((player) => player.id === first.id)!.actionAt > 1);
  const greetingAt = action.snapshot!.players.find((player) => player.id === first.id)!.actionAt;
  await emit(first, 'pose', { x: 3, z: 13, rotation: 1.2, action: 'greet', actionAt: 123 });
  const preserved = await snapshotWhere(second, (state) =>
    state.players.some((player) => player.id === first.id && player.actionAt === greetingAt),
  );
  assert.equal(preserved.selfId, second.id);
  assert.equal((await emit(first, 'action', { action: 'greet' })).ok, false);
  await emit(first, 'action', { action: 'idle' });
  assert.equal(
    (await emit(first, 'action', { action: 'bow' })).snapshot?.players.find(
      (player) => player.id === first.id,
    )?.action,
    'bow',
  );
});

test('seat ownership is atomic, authoritative, and released on disconnect', async () => {
  const first = await client();
  const second = await client();
  await join(first);
  await join(second);
  const far = await emit(first, 'seat:claim', { seatId: SEATS[0].id });
  assert.equal(far.ok, false);
  const seat = await approach(first);
  await approach(second);
  const results = await Promise.all([
    emit(first, 'seat:claim', { seatId: seat.id }),
    emit(second, 'seat:claim', { seatId: seat.id }),
  ]);
  assert.equal(results.filter((result) => result.ok).length, 1);
  const winner = results[0].ok ? first : second;
  const loser = results[0].ok ? second : first;
  const seated = results.find((result) => result.ok)!.snapshot!;
  assert.equal(seated.seats[seat.id], winner.id);
  assert.equal(seated.players.find((player) => player.id === winner.id)?.action, 'sit');
  const spoof = await emit(winner, 'pose', { x: 15, z: 20, rotation: 0, action: 'walk', actionAt: 0 });
  assert.equal(spoof.snapshot?.players.find((player) => player.id === winner.id)?.x, seat.x);
  const released = snapshotWhere(loser, (state) => state.room.count === 1 && !state.seats[seat.id]);
  winner.disconnect();
  await released;
  assert.equal((await emit(loser, 'seat:claim', { seatId: seat.id })).ok, true);
  assert.equal((await emit(loser, 'seat:release', {})).snapshot?.seats[seat.id], undefined);
  assert.equal((await emit(loser, 'seat:claim', { seatId: seat.id })).ok, true);
  assert.equal((await emit(loser, 'seat:release')).snapshot?.seats[seat.id], undefined);
});

test('room, instance, and region partition players and occupancy; room switching frees seats', async () => {
  const first = await client();
  const otherRoom = await client();
  const otherInstance = await client();
  const otherRegion = await client();
  await join(first);
  const variants = [{ room: 'truc-lam' }, { instance: 1 }, { region: 'eu' }];
  for (const [index, socket] of [otherRoom, otherInstance, otherRegion].entries()) {
    const joined = await join(socket, variants[index]);
    assert.equal(joined.snapshot?.players.length, 1);
  }
  const seat = await approach(first);
  await emit(first, 'seat:claim', { seatId: seat.id });
  await approach(otherRegion);
  assert.equal((await emit(otherRegion, 'seat:claim', { seatId: seat.id })).ok, true);
  const switched = await join(first, { room: 'truc-lam' });
  assert.equal(switched.snapshot?.room.count, 2);
  assert.equal(switched.snapshot?.players.find((player) => player.id === first.id)?.seatId, null);
  assert.equal(server.rooms.has('apac:an-nhien:0'), false);
  const listed = await fetch(`${url}/api/rooms?region=apac`).then((response) => response.json());
  assert.equal(listed.find((entry: { key: string }) => entry.key === 'apac:truc-lam:0').count, 2);
  assert.equal(listed.find((entry: { key: string }) => entry.key === 'apac:an-nhien:0').count, 0);
  assert.ok(!listed.some((entry: { region: string }) => entry.region === 'eu'));
});

test('disconnect and reconnect produce a fresh member with no phantom players', async () => {
  const first = await client();
  const observer = await client();
  await join(first);
  await join(observer);
  const oldId = first.id;
  const removed = snapshotWhere(observer, (state) => state.players.length === 1);
  first.disconnect();
  await removed;
  const replacement = await client();
  const joined = await join(replacement);
  assert.notEqual(replacement.id, oldId);
  assert.equal(joined.snapshot?.players.length, 2);
  assert.ok(!joined.snapshot?.players.some((player) => player.id === oldId));
  const health = await fetch(`${url}/api/health`).then((response) => response.json());
  assert.equal(health.players, 2);
  assert.equal(health.connections, 2);
  assert.equal(health.regionMode, 'namespace');
});

test('rejects malformed rooms, invalid poses, walls, spoofed seats and unknown actions', async () => {
  const first = await client();
  assert.equal((await join(first, { room: '../../bad' })).ok, false);
  assert.equal((await join(first, { instance: -1 })).ok, false);
  await join(first);
  for (const value of [
    { x: NaN, z: 14 },
    { x: 0, z: -10 },
    { x: 9999, z: 0 },
    { x: 0, z: 14, action: 'sit' },
  ]) {
    assert.equal((await emit(first, 'pose', { rotation: 0, action: 'walk', ...value })).ok, false);
  }
  assert.equal((await emit(first, 'action', { action: 'fly' })).ok, false);
  assert.equal((await emit(first, 'seat:claim', { seatId: 'made-up-seat' })).ok, false);
  const self = [...server.rooms.values()][0].players.get(first.id!)!;
  const forged = await emit(first, 'pose', { x: self.x, z: self.z, rotation: 0, action: 'bow', actionAt: 1 });
  assert.equal(forged.ok, true);
  const state = await snapshotWhere(first, (snapshot) => snapshot.players.length === 1);
  assert.equal(state.players[0].action, 'idle');
});

test('capacity rejection keeps a player in the previous room', async () => {
  await server.close();
  server = createTempleServer({ capacity: 1 });
  url = `http://127.0.0.1:${await server.listen()}`;
  const first = await client();
  const second = await client();
  await join(first);
  await join(second, { room: 'truc-lam' });
  assert.equal((await join(second)).ok, false);
  const state = await snapshotWhere(second, (snapshot) => snapshot.room.room === 'truc-lam');
  assert.equal(state.room.count, 1);
  assert.equal(state.selfId, second.id);
});

test('malformed and null messages are rejected without disconnecting a healthy client', async () => {
  const socket = await client();
  for (const invalid of [
    null,
    42,
    'apac',
    {},
    { ...room, instance: 0.5 },
    { ...room, region: 'apac:other' },
  ]) {
    assert.equal((await emit(socket, 'join', invalid)).ok, false);
  }
  assert.equal((await join(socket)).ok, true);
  for (const invalid of [null, [], 'walk', { x: 0 }, { x: 0, z: 14, rotation: Infinity, action: 'walk' }]) {
    assert.equal((await emit(socket, 'pose', invalid)).ok, false);
  }
  for (const event of ['action', 'seat:claim']) {
    assert.equal((await emit(socket, event, null)).ok, false);
    assert.equal((await emit(socket, event, {})).ok, false);
  }
  assert.equal((await emit(socket, 'seat:release', null)).ok, true);
  assert.equal(socket.connected, true);
  assert.equal((await fetch(`${url}/api/rooms?region[]=apac`)).status, 400);
  assert.equal((await fetch(`${url}/api/rooms?region=..`)).status, 400);
});

test('bow replay spam cannot reset server animation time and poses cannot claim a bow', async () => {
  const first = await client();
  const observer = await client();
  await join(first);
  await join(observer);
  const start = await emit(first, 'action', { action: 'bow' });
  const beganAt = start.snapshot!.players.find((player) => player.id === first.id)!.actionAt;
  const repeated = await Promise.all(
    Array.from({ length: 6 }, () => emit(first, 'action', { action: 'bow' })),
  );
  assert.ok(repeated.every((result) => result.ok === false));
  await emit(first, 'pose', {
    x: start.snapshot!.players[0].x,
    z: start.snapshot!.players[0].z,
    rotation: 0,
    action: 'bow',
    actionAt: 1,
  });
  const state = await snapshotWhere(observer, (snapshot) =>
    snapshot.players.some((player) => player.id === first.id && player.action === 'bow'),
  );
  assert.equal(state.players.find((player) => player.id === first.id)!.actionAt, beganAt);
  assert.equal((await emit(first, 'action', { action: 'idle' })).ok, true);
  await emit(first, 'pose', { x: 0, z: 14, rotation: 0, action: 'bow', actionAt: Date.now() });
  const idle = await snapshotWhere(observer, (snapshot) =>
    snapshot.players.some((player) => player.id === first.id && player.action === 'idle'),
  );
  assert.equal(idle.players.find((player) => player.id === first.id)!.action, 'idle');
});

test('a final movement packet arriving after a gesture starts does not cancel that gesture', async () => {
  const first = await client();
  const observer = await client();
  const joined = await join(first);
  await join(observer);
  const self = joined.snapshot!.players[0];
  const started = await emit(first, 'action', { action: 'bow' });
  const timestamp = started.snapshot!.players.find((player) => player.id === first.id)!.actionAt;
  await emit(first, 'pose', {
    x: self.x + 0.2,
    z: self.z,
    rotation: 0,
    action: 'bow',
    actionAt: timestamp - 500,
  });
  const corrected = await snapshotWhere(observer, (state) =>
    state.players.some((player) => player.id === first.id && player.x === self.x + 0.2),
  );
  const actor = corrected.players.find((player) => player.id === first.id)!;
  assert.equal(actor.action, 'bow');
  assert.equal(actor.actionAt, timestamp);
  await emit(first, 'pose', { x: self.x + 0.4, z: self.z, rotation: 0, action: 'walk', actionAt: 0 });
  const walking = await snapshotWhere(observer, (state) =>
    state.players.some((player) => player.id === first.id && player.action === 'walk'),
  );
  assert.equal(walking.players.find((player) => player.id === first.id)!.action, 'walk');
});

test('room switching releases a seat while other occupants remain connected', async () => {
  const first = await client();
  const observer = await client();
  await join(first);
  await join(observer);
  const seat = await approach(first);
  await approach(observer);
  const occupancy = snapshotWhere(observer, (state) => state.seats[seat.id] === first.id);
  await emit(first, 'seat:claim', { seatId: seat.id });
  await occupancy;
  const release = snapshotWhere(observer, (state) => !state.seats[seat.id] && state.room.count === 1);
  await join(first, { instance: 2 });
  await release;
  assert.equal((await emit(observer, 'seat:claim', { seatId: seat.id })).ok, true);
  const left = await emit(observer, 'leave', {});
  assert.equal(left.ok, true);
  assert.equal(server.rooms.has('apac:an-nhien:0'), false);
});

test('private rooms require a random invite and never expose it in listings, snapshots or health', async () => {
  const owner = await client();
  const guest = await client();
  const outsider = await client();
  await join(outsider);
  const created = await emit(owner, 'create-room', {
    room: 'private-lotus',
    instance: 0,
    region: 'apac',
    visibility: 'private',
  });
  assert.equal(created.ok, true);
  assert.match(created.room!.invite!, /^[a-zA-Z0-9_-]{32}$/);
  assert.equal((await join(owner, created.room)).ok, true);
  assert.equal((await join(guest, { room: 'private-lotus' })).ok, false);
  assert.equal((await join(guest, { ...created.room, invite: 'é'.repeat(32) })).ok, false);
  assert.equal((await join(guest, { ...created.room, invite: 'a'.repeat(32) })).ok, false);
  const accepted = await join(guest, created.room);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.snapshot?.room.count, 2);
  assert.equal(accepted.snapshot?.room.visibility, 'private');
  assert.equal(accepted.snapshot?.room.invite, undefined);
  const list = await fetch(`${url}/api/rooms`).then((response) => response.json());
  assert.ok(!list.some((entry: { room: string }) => entry.room === 'private-lotus'));
  const healthText = await fetch(`${url}/api/health`).then((response) => response.text());
  assert.ok(!healthText.includes(created.room!.invite!));
  assert.ok(!healthText.includes('private-lotus'));
  assert.equal((await join(outsider, { room: 'private-lotus' })).ok, false);
  assert.equal((await emit(outsider, 'chat:history', {})).ok, true);
  await emit(owner, 'leave', {});
  await emit(guest, 'leave', {});
  // A private invitation stays valid through an empty room/reconnect during this process.
  assert.equal((await join(owner, created.room)).ok, true);
});

test('session identity cannot be shared by active sockets and reconnect leaves no ghost member', async () => {
  const first = await client();
  const second = await client();
  const sessionId = 'session-a-12345678';
  assert.equal((await join(first, { sessionId, avatar: 'sage' })).snapshot?.players[0].avatar, 'sage');
  assert.equal((await join(second, { sessionId })).ok, false);
  assert.equal((await join(first, { sessionId: 'session-b-12345678' })).ok, false);
  const departed = new Promise<void>((resolve) =>
    server.io.sockets.sockets.get(first.id!)!.once('disconnect', () => resolve()),
  );
  first.disconnect();
  await departed;
  const reconnect = await join(second, { sessionId, avatar: 'lotus' });
  assert.equal(reconnect.ok, true);
  assert.equal(reconnect.snapshot?.players.length, 1);
  assert.equal(reconnect.snapshot?.players[0].avatar, 'lotus');
});

test('chat is room scoped, sanitized, capped, rate limited and retained only for that room', async () => {
  const sender = await client();
  const receiver = await client();
  const outsider = await client();
  await join(sender, { name: '<b>Sen</b>\u0000' });
  await join(receiver);
  await join(outsider, { room: 'truc-lam' });
  let leaked = 0;
  outsider.on('chat', () => leaked++);
  const incoming = new Promise<{ text: string; name: string; playerId: string }>((resolve) =>
    receiver.once('chat', resolve),
  );
  assert.equal(
    (await emit(sender, 'chat:send', { text: 'Xin chào <b>các bạn</b>\u0000 fuck địt' })).ok,
    true,
  );
  const received = await incoming;
  assert.equal(received.text, 'Xin chào các bạn *** ***');
  assert.equal(received.name, 'Sen');
  assert.equal(received.playerId, sender.id);
  assert.equal((await emit(sender, 'chat:send', { text: 'spam' })).ok, false);
  assert.equal((await emit(receiver, 'chat:send', { text: 'a'.repeat(201) })).ok, false);
  assert.equal((await emit(receiver, 'chat:send', { text: '\u0000<b></b>' })).ok, false);
  const history = await emit(receiver, 'chat:history', {});
  assert.equal(history.messages?.length, 1);
  assert.equal(history.messages?.[0].text, received.text);
  assert.equal((await emit(outsider, 'chat:history', {})).messages?.length, 0);
  assert.equal(leaked, 0);
});

test('presence events describe real joins and departures without duplicating profile updates', async () => {
  const observer = await client();
  const visitor = await client();
  await join(observer);
  const seen: Array<{ id: string; kind: string }> = [];
  observer.on('presence', (event) => seen.push(event));
  const joined = new Promise<void>((resolve) => observer.once('presence', () => resolve()));
  await join(visitor);
  await joined;
  await join(visitor, { name: 'Tên mới' });
  const left = new Promise<void>((resolve) => observer.once('presence', () => resolve()));
  await emit(visitor, 'leave', {});
  await left;
  assert.deepEqual(
    seen.map((event) => event.kind),
    ['join', 'leave'],
  );
  assert.ok(seen.every((event) => event.id === visitor.id));
});

test('server rejects teleports, aggregate speed abuse and swept collisions, and corrects the sender', async () => {
  const socket = await client();
  const joined = await join(socket);
  const self = joined.snapshot!.players[0];
  const correction = new Promise<{ x: number; z: number }>((resolve) => socket.once('correction', resolve));
  assert.equal((await emit(socket, 'pose', { x: 20, z: 20, rotation: 0, action: 'run' })).ok, false);
  assert.deepEqual(await correction, {
    x: self.x,
    z: self.z,
    rotation: Math.PI, // Corrections retain authoritative precision; snapshots round for transport.
    action: 'idle',
    actionAt: self.actionAt,
  });
  let x = self.x;
  let rejects = 0;
  for (let i = 0; i < 12; i++) {
    const ack = await emit(socket, 'pose', { x: x + 0.4, z: self.z, rotation: 0, action: 'walk' });
    if (ack.ok) x += 0.4;
    else rejects++;
  }
  assert.ok(rejects >= 8, 'Repeated packets cannot regenerate movement credit');
  positionFixture(socket, 9.5, 7.6);
  await new Promise((resolve) => setTimeout(resolve, 550));
  assert.equal((await emit(socket, 'pose', { x: 9.5, z: 9.4, rotation: 0, action: 'run' })).ok, false);
  assert.equal(
    (await fetch(`${url}/api/health`).then((response) => response.json())).counters.rejectedPoses >= 10,
    true,
  );
});

test('walk/run movement within real elapsed time is accepted and prayer requires the altar', async () => {
  const socket = await client();
  const joined = await join(socket);
  const self = joined.snapshot!.players[0];
  assert.equal((await emit(socket, 'action', { action: 'pray' })).ok, false);
  let x = self.x;
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve, 180));
    x += 0.5;
    assert.equal((await emit(socket, 'pose', { x, z: self.z, rotation: 0, action: 'walk' })).ok, true);
  }
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal((await emit(socket, 'pose', { x: x + 1.0, z: self.z, rotation: 0, action: 'run' })).ok, true);
  positionFixture(socket, 0, -6);
  assert.equal((await emit(socket, 'action', { action: 'pray' })).snapshot?.players[0].action, 'pray');
  assert.equal((await emit(socket, 'action', { action: 'wave' })).snapshot?.players[0].action, 'wave');
});

test('20 independent socket clients synchronize without duplicates and room events stay isolated', async () => {
  const sockets = await Promise.all(Array.from({ length: 20 }, () => client()));
  const results = await Promise.all(
    sockets.map((socket, index) =>
      join(socket, {
        name: `Guest ${index}`,
        sessionId: `load-session-${index}`,
        avatar: index % 2 ? 'sage' : 'dck',
      }),
    ),
  );
  assert.ok(results.every((result) => result.ok));
  const state = await snapshotWhere(sockets[0], (snapshot) => snapshot.players.length === 20);
  assert.equal(new Set(state.players.map((player) => player.id)).size, 20);
  const poses = await Promise.all(
    sockets.map((socket, index) => {
      const player = state.players.find((item) => item.id === socket.id)!;
      return emit(socket, 'pose', {
        x: player.x + 0.15,
        z: player.z,
        rotation: index / 10,
        action: index % 2 ? 'run' : 'walk',
      });
    }),
  );
  assert.ok(poses.every((result) => result.ok));
  await snapshotWhere(sockets[19], (snapshot) =>
    snapshot.players.every((player) => ['walk', 'run'].includes(player.action)),
  );
  const switched = await join(sockets[19], { instance: 9, sessionId: 'load-session-19' });
  assert.equal(switched.snapshot?.players.length, 1);
  const original = await snapshotWhere(sockets[0], (snapshot) => snapshot.players.length === 19);
  assert.ok(!original.players.some((player) => player.id === sockets[19].id));
  assert.equal((await emit(sockets[0], 'chat:send', { text: 'Bình an cùng mọi người' })).ok, true);
  assert.equal((await emit(sockets[19], 'chat:history', {})).messages?.length, 0);
  assert.equal((await fetch(`${url}/api/health`).then((response) => response.json())).connections, 20);
});

test('production origin checks reject foreign origins and ignore forged forwarded hosts', async () => {
  await server.close();
  server = createTempleServer({ production: true, allowedOrigins: ['https://garden.example'] });
  url = `http://127.0.0.1:${await server.listen()}`;
  const tryOrigin = (origin: string, forwardedHost?: string) =>
    new Promise<boolean>((resolve) => {
      const socket = io(url, {
        transports: ['websocket'],
        forceNew: true,
        reconnection: false,
        extraHeaders: { Origin: origin, ...(forwardedHost ? { 'X-Forwarded-Host': forwardedHost } : {}) },
      });
      clients.push(socket);
      socket.once('connect', () => resolve(true));
      socket.once('connect_error', () => {
        socket.disconnect();
        resolve(false);
      });
    });
  assert.equal(await tryOrigin('https://foreign.example', 'foreign.example'), false);
  assert.equal(await tryOrigin('http://localhost:5173'), false);
  assert.equal(await tryOrigin('https://garden.example'), true);
  assert.equal(await tryOrigin(url), true);
  const deniedPolling = await fetch(`${url}/socket.io/?EIO=4&transport=polling`, {
    headers: { Origin: 'https://foreign.example' },
  });
  assert.equal(deniedPolling.status, 403);
  assert.equal(deniedPolling.headers.get('access-control-allow-origin'), null);
  const allowedPolling = await fetch(`${url}/socket.io/?EIO=4&transport=polling`, {
    headers: { Origin: 'https://garden.example' },
  });
  assert.equal(allowedPolling.status, 200);
  assert.equal(allowedPolling.headers.get('access-control-allow-origin'), 'https://garden.example');
  const health = await fetch(`${url}/api/health`);
  assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(health.headers.get('referrer-policy'), 'no-referrer');
});

test('connection ceiling refuses excess sockets without disturbing existing players', async () => {
  await server.close();
  server = createTempleServer({ maxConnections: 2 });
  url = `http://127.0.0.1:${await server.listen()}`;
  const first = await client();
  const second = await client();
  await join(first);
  await join(second);
  const rejected = io(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  clients.push(rejected);
  const full = new Promise<void>((resolve) => rejected.once('server:full', () => resolve()));
  const disconnected = new Promise<void>((resolve) => rejected.once('disconnect', () => resolve()));
  await full;
  await disconnected;
  const health = await fetch(`${url}/api/health`).then((response) => response.json());
  assert.equal(health.players, 2);
  assert.equal(health.maxConnections, 2);
  assert.equal(first.connected, true);
  assert.equal(second.connected, true);
});

test('snapshots round wire coordinates while authoritative state keeps full precision', async () => {
  const socket = await client();
  await join(socket);
  const pose = { x: -2.123456, z: 14.123456, rotation: 1.234567, action: 'walk' };
  const incoming = snapshotWhere(socket, (state) => Math.abs(state.players[0].x - pose.x) < 0.001);
  assert.equal((await emit(socket, 'pose', pose)).ok, true);
  const transmitted = (await incoming).players[0];
  assert.equal(transmitted.x, -2.123);
  assert.equal(transmitted.z, 14.123);
  assert.equal(transmitted.rotation, 1.235);
  const authoritative = [...server.rooms.values()][0].players.get(socket.id!)!;
  assert.equal(authoritative.x, pose.x);
  assert.equal(authoritative.z, pose.z);
  assert.ok(Math.abs(authoritative.rotation - pose.rotation) < 1e-12);
});

test('bell and lantern events synchronize real room members; late join history is scoped and expires', async () => {
  const first = await client();
  const observer = await client();
  const outsider = await client();
  await join(first, { name: '<b>Sen</b>' });
  await join(observer);
  await join(outsider, { room: 'truc-lam' });
  let leaked = 0;
  outsider.on('world:event', () => leaked++);
  for (const kind of ['bell', 'lantern'] as const) {
    const point = INTERACTION_POINTS[kind];
    positionFixture(first, point.x, point.z);
    const received = new Promise<WorldEvent>((resolve) => observer.once('world:event', resolve));
    const ack = await emit(first, 'world:interact', { kind });
    assert.equal(ack.ok, true);
    const event = await received;
    assert.equal(event.kind, kind);
    assert.equal(event.playerId, first.id);
    assert.equal(event.name, 'Sen');
    assert.deepEqual(ack.events, [event]);
    assert.ok(event.at <= Date.now() && Date.now() - event.at < 1000);
  }
  assert.equal(leaked, 0);
  assert.deepEqual((await emit(outsider, 'world:history', {})).events, []);
  const late = await client();
  await join(late);
  const history = await emit(late, 'world:history', {});
  assert.deepEqual(
    history.events?.map((event) => event.kind),
    ['bell', 'lantern'],
  );
  assert.equal(new Set(history.events?.map((event) => event.id)).size, 2);
  const state = server.rooms.get('apac:an-nhien:0')!;
  state.events.find((event) => event.kind === 'bell')!.at -= 9000;
  assert.deepEqual(
    (await emit(late, 'world:history', {})).events?.map((event) => event.kind),
    ['lantern'],
  );
  state.events[0].at -= 61000;
  assert.deepEqual((await emit(late, 'world:history', {})).events, []);
});

test('world interactions reject unjoined, unknown, distant and seated or bowing players', async () => {
  const socket = await client();
  assert.equal((await emit(socket, 'world:interact', { kind: 'bell' })).ok, false);
  assert.equal((await emit(socket, 'world:history', {})).ok, false);
  await join(socket);
  assert.equal((await emit(socket, 'world:interact', { kind: 'teleport' })).ok, false);
  assert.equal((await emit(socket, 'world:interact', null)).ok, false);
  assert.equal((await emit(socket, 'world:interact', { kind: 'bell' })).ok, false);
  assert.equal((await emit(socket, 'world:interact', { kind: 'lantern' })).ok, false);
  positionFixture(socket, INTERACTION_POINTS.bell.x, INTERACTION_POINTS.bell.z);
  await emit(socket, 'action', { action: 'bow' });
  assert.equal((await emit(socket, 'world:interact', { kind: 'bell' })).ok, false);
  await emit(socket, 'action', { action: 'idle' });
  const seat = await approach(socket);
  assert.equal((await emit(socket, 'seat:claim', { seatId: seat.id })).ok, true);
  positionFixture(socket, INTERACTION_POINTS.bell.x, INTERACTION_POINTS.bell.z);
  assert.equal((await emit(socket, 'world:interact', { kind: 'bell' })).ok, false);
  assert.deepEqual((await emit(socket, 'world:history', {})).events, []);
});

test('shared bell cooldown protects the room and each player has a separate cooldown', async () => {
  const first = await client();
  const second = await client();
  await join(first);
  await join(second);
  for (const socket of [first, second])
    positionFixture(socket, INTERACTION_POINTS.bell.x, INTERACTION_POINTS.bell.z);
  assert.equal((await emit(first, 'world:interact', { kind: 'bell' })).ok, true);
  assert.equal((await emit(second, 'world:interact', { kind: 'bell' })).ok, false);
  const state = server.rooms.get('apac:an-nhien:0')!;
  state.worldAt.bell = Date.now() - 3000; // Advance only room cooldown; player's cooldown remains active.
  assert.equal((await emit(first, 'world:interact', { kind: 'bell' })).ok, false);
  assert.equal((await emit(second, 'world:interact', { kind: 'bell' })).ok, true);
  assert.equal(state.events.length, 2);
});
