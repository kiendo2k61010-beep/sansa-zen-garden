import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { createTempleServer } from '../server/app.ts';
import { TempleNetwork } from '../src/network.ts';
import { INTERACTION_POINTS, type Pose, type Snapshot, type WorldEvent } from '../shared/world.ts';

let server: ReturnType<typeof createTempleServer>;
let url: string;
let clients: TempleNetwork[];
const room = { room: 'an-nhien', instance: 0, region: 'apac' };
beforeEach(async () => {
  server = createTempleServer({ capacity: 2 });
  url = `http://127.0.0.1:${await server.listen()}`;
  clients = [];
});
afterEach(async () => {
  clients.forEach((client) => client.dispose());
  await server.close();
});
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(condition: () => boolean, timeout = 4500) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeout) throw new Error('Network condition timed out');
    await sleep(15);
  }
}
function create(autoJoin = false, correction?: (pose: Pose) => void) {
  const states: Snapshot[] = [];
  const errors: string[] = [];
  const network = new TempleNetwork(
    room,
    'Guest',
    '#b97847',
    {
      snapshot: (snapshot) => states.push(snapshot),
      status: () => undefined,
      greet: () => undefined,
      error: (error) => errors.push(error),
      correction,
    },
    { autoJoin, url, avatar: 'sage' },
  );
  clients.push(network);
  return { network, states, errors };
}

test('onboarding opens a connection without joining and each client gets a fresh memory-only session', async () => {
  const first = create();
  const second = create();
  await waitFor(() => first.network.socket.connected && second.network.socket.connected);
  assert.notEqual(first.network.sessionId, second.network.sessionId);
  assert.equal(first.network.joined, false);
  assert.equal(server.rooms.size, 0);
  assert.equal((await first.network.join()).ok, true);
  assert.equal(first.states.at(-1)?.players[0].avatar, 'sage');
  assert.equal((await second.network.join()).ok, true);
  await waitFor(() => first.states.at(-1)?.players.length === 2);
  assert.equal((await first.network.leave()).ok, true);
  assert.equal(first.network.joined, false);
  await waitFor(() => second.states.at(-1)?.players.length === 1);
});

test('delayed pose acknowledgements coalesce predictions and a correction cannot replay a stale backlog', async () => {
  let poseRequests = 0;
  let firstReleased = false;
  let queuedBeforeRelease = 0;
  let corrections = 0;
  let z = 14;
  server.io.on('connection', (socket) => {
    socket.use(([event], next) => {
      if (event !== 'pose') return next();
      poseRequests++;
      if (poseRequests === 1) {
        setTimeout(() => {
          firstReleased = true;
          next();
        }, 1000);
      } else {
        if (!firstReleased) queuedBeforeRelease++;
        next();
      }
    });
  });
  const { network } = create(false, (pose) => {
    corrections++;
    z = pose.z;
  });
  const joined = await network.join();
  assert.equal(joined.ok, true);
  const self = joined.snapshot!.players.find((player) => player.id === joined.snapshot!.selfId)!;
  z = self.z;
  const initialZ = z;
  const timer = setInterval(() => {
    z += 3.5 * 0.08;
    network.pose({ x: self.x, z, rotation: 0, action: 'walk', actionAt: Date.now() });
  }, 80);
  try {
    await waitFor(() => poseRequests > 0);
    await sleep(650);
    assert.equal(poseRequests, 1, 'only one position update may await acknowledgement');
    await sleep(1700);
    assert.equal(queuedBeforeRelease, 0);
    assert.ok(corrections <= 2, `a long stall must not create a correction cascade (${corrections})`);
    const player = [...server.rooms.values()][0].players.get(network.socket.id!)!;
    assert.ok(player.z > initialZ + 3, 'walking must resume after the delayed packet is reconciled');
    assert.ok(poseRequests < 25, 'intermediate positions during the stall must be coalesced');
  } finally {
    clearInterval(timer);
  }
});

test('interactions can await the latest coalesced position after a delayed packet', async () => {
  const received: string[] = [];
  server.io.on('connection', (socket) => {
    socket.use(([event], next) => {
      if (event !== 'pose' && event !== 'action') return next();
      received.push(event);
      if (received.length === 1) setTimeout(next, 700);
      else next();
    });
  });
  const { network } = create();
  const joined = await network.join();
  const self = joined.snapshot!.players.find((player) => player.id === joined.snapshot!.selfId)!;
  const pose = { x: self.x, z: self.z + 0.3, rotation: 0, action: 'walk' as const, actionAt: Date.now() };
  network.pose(pose);
  let acknowledged = false;
  const ready = network.syncPose({ ...pose, z: self.z + 0.8 }).then((ack) => {
    acknowledged = true;
    return ack;
  });
  network.pose({ ...pose, z: self.z + 1 });
  await sleep(200);
  assert.equal(acknowledged, false);
  assert.equal((await ready).ok, true);
  const action = await network.request('action', { action: 'wave' });
  assert.equal(action.ok, true);
  assert.deepEqual(received, ['pose', 'pose', 'action']);
  assert.equal(action.snapshot!.players[0].z, self.z + 1);
});

test('explicit join can wait for connection, private room invites survive joins and chat history is available', async () => {
  const first = create();
  const created = await first.network.createRoom({ room: 'network-private', visibility: 'private' });
  assert.equal(created.ok, true);
  const second = create();
  assert.equal(
    (await Promise.all([first.network.join(created.room!), second.network.join(created.room!)])).every(
      (ack) => ack.ok,
    ),
    true,
  );
  assert.equal(first.network.spec.invite, created.room!.invite);
  assert.equal((await first.network.sendChat('Xin chào')).ok, true);
  const history = await second.network.chatHistory();
  assert.equal(history.messages?.[0].text, 'Xin chào');
});

test('failed room switches preserve previous snapshot and current membership', async () => {
  const first = create();
  const second = create();
  const third = create();
  await Promise.all([first.network.join(), second.network.join()]);
  const previous = { ...room, room: 'truc-lam' };
  await third.network.join(previous);
  assert.equal((await third.network.join(room)).ok, false);
  assert.equal(third.network.joined, true);
  assert.deepEqual(third.network.spec, previous);
  assert.equal(third.states.at(-1)?.room.room, 'truc-lam');
  assert.equal(third.errors.length, 1);
});

test('transport reconnection re-enters once with the same session and leave prevents automatic re-entry', async () => {
  const first = create(true);
  const second = create(true);
  await waitFor(
    () => first.network.joined && second.network.joined && first.states.at(-1)?.players.length === 2,
  );
  const sessionId = first.network.sessionId;
  const oldId = first.network.socket.id;
  first.network.socket.io.engine.close();
  await waitFor(() => !first.network.joined);
  await waitFor(() => first.network.joined && first.network.socket.id !== oldId);
  assert.equal(first.network.sessionId, sessionId);
  await waitFor(() => second.states.at(-1)?.players.length === 2);
  assert.ok(!second.states.at(-1)?.players.some((player) => player.id === oldId));
  assert.equal(new Set(second.states.at(-1)!.players.map((player) => player.id)).size, 2);
  await first.network.leave();
  first.network.socket.io.engine.close();
  await waitFor(() => !first.network.socket.connected);
  await waitFor(() => first.network.socket.connected);
  assert.equal(first.network.joined, false);
  assert.equal(
    [...server.rooms.values()].reduce((sum, state) => sum + state.players.size, 0),
    1,
  );
});

test('pagehide disconnects promptly, persisted pageshow restores one member, and disposal removes lifecycle listeners', async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const page = new EventTarget();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: page });
  try {
    const first = create(true);
    const second = create(true);
    await waitFor(() => first.network.joined && second.network.joined);
    const oldId = first.network.socket.id;
    const session = first.network.sessionId;
    page.dispatchEvent(new Event('pagehide'));
    await waitFor(() => [...server.rooms.values()].every((state) => state.players.size === 0));
    assert.equal(first.network.socket.connected, false);
    assert.equal(second.network.socket.connected, false);
    page.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: false }));
    assert.equal(first.network.socket.connected, false);
    page.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
    await waitFor(
      () => first.network.joined && second.network.joined && first.states.at(-1)?.players.length === 2,
    );
    assert.notEqual(first.network.socket.id, oldId);
    assert.equal(first.network.sessionId, session);
    assert.equal(new Set(first.states.at(-1)!.players.map((player) => player.id)).size, 2);
    first.network.dispose();
    second.network.dispose();
    page.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
    await sleep(30);
    assert.equal(first.network.socket.connected, false);
    assert.equal(first.network.socket.active, false);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

test('network exposes authoritative world event callbacks and scoped active history', async () => {
  const received: WorldEvent[] = [];
  const actor = create();
  const observer = new TempleNetwork(
    room,
    'Observer',
    '#b97847',
    {
      snapshot: () => undefined,
      status: () => undefined,
      greet: () => undefined,
      error: () => undefined,
      worldEvent: (event) => received.push(event),
    },
    { autoJoin: false, url },
  );
  clients.push(observer);
  assert.equal((await actor.network.interactWorld('bell')).ok, false);
  await actor.network.join();
  await observer.join();
  const player = server.rooms.get('apac:an-nhien:0')!.players.get(actor.network.socket.id!)!;
  Object.assign(player, { x: INTERACTION_POINTS.lantern.x, z: INTERACTION_POINTS.lantern.z });
  const ack = await actor.network.interactWorld('lantern');
  assert.equal(ack.ok, true);
  await waitFor(() => received.length === 1);
  assert.equal(received[0].kind, 'lantern');
  assert.deepEqual((await observer.worldHistory()).events, received);
  await observer.join({ ...room, room: 'truc-lam' });
  assert.deepEqual((await observer.worldHistory()).events, []);
});
