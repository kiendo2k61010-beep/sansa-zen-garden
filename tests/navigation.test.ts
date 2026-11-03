import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera } from 'three';
import { clearPath, findPath, PlayerController, type Point } from '../src/scene/controller';
import { OBSTACLES, SEATS, groundHeight, walkable } from '../shared/world';

function verifyRoute(from: Point, to: Point) {
  const path = findPath(from, to);
  assert.ok(path, `No route to ${JSON.stringify(to)}`);
  assert.deepEqual(path.at(-1), to);
  let previous = from;
  for (const waypoint of path) {
    assert.ok(walkable(waypoint.x, waypoint.z));
    assert.ok(
      clearPath(previous, waypoint),
      `Route crosses an obstacle: ${JSON.stringify(previous)} -> ${JSON.stringify(waypoint)}`,
    );
    previous = waypoint;
  }
  return path;
}

test('all twelve cushions are reachable from the arrival gate', () => {
  for (const seat of SEATS) verifyRoute({ x: 0, z: 17 }, { x: seat.x, z: seat.z });
});
test('path navigates around the pond rather than crossing it', () => {
  const from = { x: -22, z: 4 },
    // Stay outside the newly enforced timber side screen and the wider chibi body.
    to = { x: -10.2, z: 4 };
  assert.equal(clearPath(from, to), false);
  assert.ok(verifyRoute(from, to).length >= 2);
});
test('path crosses the hall without cutting altar or column corners', () => {
  verifyRoute({ x: -12, z: -10 }, { x: 12, z: -10 });
  verifyRoute({ x: -11, z: 2 }, { x: -8, z: 4 });
});
test('invalid, blocked, and outside destinations are rejected', () => {
  for (const to of [
    { x: 0, z: -10 },
    { x: 16, z: -6 },
    { x: NaN, z: 3 },
    { x: 29, z: 0 },
  ]) {
    assert.equal(findPath({ x: 0, z: 17 }, to), null);
  }
});
test('unobstructed routes retain exact destinations', () => {
  assert.deepEqual(findPath({ x: 0, z: 17 }, { x: 2.123, z: 13.456 }), [{ x: 2.123, z: 13.456 }]);
});

test('all cushions are reachable from both gardens and behind the hall', () => {
  for (const start of [
    { x: -22, z: 12 },
    { x: 22, z: 12 },
    { x: 0, z: -18 },
  ]) {
    for (const seat of SEATS) verifyRoute(start, { x: seat.x, z: seat.z });
  }
});

test('altar, pillars, pond, bell pavilion, and garden stones cannot be crossed', () => {
  for (const obstacle of OBSTACLES) {
    assert.equal(walkable(obstacle.x, obstacle.z), false);
    const from = { x: obstacle.x - obstacle.hx - 0.7, z: obstacle.z };
    const to = { x: obstacle.x + obstacle.hx + 0.7, z: obstacle.z };
    assert.equal(clearPath(from, to), false);
    if (walkable(from.x, from.z) && walkable(to.x, to.z)) verifyRoute(from, to);
  }
});

test('stair route reaches the hall through each of the three rising floor levels', () => {
  const route = verifyRoute({ x: 0, z: 13 }, { x: 0, z: 8 });
  const heights = [12.5, 11.5, 10.5, 9.5, 8.5].map((z) => groundHeight(0, z));
  assert.deepEqual(heights, [0, 0.15, 0.3, 0.45, 0.6]);
  assert.deepEqual(route.at(-1), { x: 0, z: 8 });
  assert.equal(groundHeight(12, 8), 0);
});

test('controller follows obstacle routes to completion without collision or corner stalls', () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    value: new EventTarget(),
    configurable: true,
    writable: true,
  });
  const canvas = Object.assign(new EventTarget(), { style: {} }) as unknown as HTMLCanvasElement;
  const controller = new PlayerController(new PerspectiveCamera(), canvas, () => {});
  try {
    for (const [from, to] of [
      [
        { x: -22, z: 4 },
        { x: -10.2, z: 4 },
      ],
      [
        { x: -12, z: -10 },
        { x: 12, z: -10 },
      ],
      [
        { x: 0, z: 17 },
        { x: 6, z: -4 },
      ],
    ]) {
      controller.teleport(from.x, from.z);
      assert.equal(controller.setTarget(to.x, to.z), true);
      let frames = 0;
      while (controller.target && frames++ < 5000) {
        controller.update(1 / 60);
        assert.ok(walkable(controller.x, controller.z));
      }
      assert.ok(frames < 5000, 'Movement stalled before the destination');
      assert.ok(Math.hypot(controller.x - to.x, controller.z - to.z) < 0.001);
    }
    controller.teleport(0, 17);
    controller.setTarget(0, 12);
    controller.enabled = false;
    controller.update(1 / 60);
    assert.equal(controller.z, 17, 'Disabled players must remain still during greetings and prostrations');
    controller.teleport(2, 4, Math.PI);
    assert.equal(controller.target, null, 'Seating teleport clears residual walking routes');
    assert.equal(controller.moving, false);
  } finally {
    controller.dispose();
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

function withController(
  run: (controller: PlayerController, events: EventTarget, camera: PerspectiveCamera) => void,
) {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousHTMLElement = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement');
  class InputElement extends EventTarget {
    tagName = 'INPUT';
    isContentEditable = false;
  }
  const events = new EventTarget();
  Object.defineProperty(globalThis, 'window', { value: events, configurable: true });
  Object.defineProperty(globalThis, 'HTMLElement', { value: InputElement, configurable: true });
  const canvas = Object.assign(new EventTarget(), { style: {} }) as unknown as HTMLCanvasElement;
  const camera = new PerspectiveCamera();
  const controller = new PlayerController(camera, canvas, () => {});
  try {
    run(controller, events, camera);
  } finally {
    controller.dispose();
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (previousHTMLElement) Object.defineProperty(globalThis, 'HTMLElement', previousHTMLElement);
    else Reflect.deleteProperty(globalThis, 'HTMLElement');
  }
}

function key(events: EventTarget, type: string, code: string) {
  const event = new Event(type, { cancelable: true });
  Object.defineProperty(event, 'code', { value: code });
  events.dispatchEvent(event);
}

test('Shift runs at 5.8 m/s and releasing Shift restores 3.5 m/s without diagonal boost', () => {
  withController((controller, events) => {
    key(events, 'keydown', 'KeyW');
    key(events, 'keydown', 'KeyD');
    key(events, 'keydown', 'ShiftLeft');
    const start = { x: controller.x, z: controller.z };
    for (let frame = 0; frame < 20; frame++) controller.update(0.05);
    assert.ok(Math.abs(Math.hypot(controller.x - start.x, controller.z - start.z) - 5.8) < 1e-8);
    assert.equal(controller.running, true);
    key(events, 'keyup', 'ShiftLeft');
    const next = { x: controller.x, z: controller.z };
    controller.update(0.05);
    assert.ok(Math.abs(Math.hypot(controller.x - next.x, controller.z - next.z) - 0.175) < 1e-8);
    assert.equal(controller.running, false);
    key(events, 'keyup', 'KeyW');
    key(events, 'keyup', 'KeyD');
    controller.update(0.05);
    assert.equal(controller.moving, false);
  });
});

test('analog joystick retains magnitude, normalizes oversized input, and stops on release', () => {
  withController((controller) => {
    controller.setTarget(0, 12);
    controller.setMoveInput(0.5, 0);
    assert.equal(controller.navigating, false);
    controller.update(0.05);
    assert.ok(Math.abs(Math.hypot(controller.x, controller.z - 17) - 0.0875) < 1e-8);
    controller.teleport(0, 17);
    controller.setMoveInput(100, 100, true);
    controller.update(0.05);
    assert.ok(Math.abs(Math.hypot(controller.x, controller.z - 17) - 0.29) < 1e-8);
    assert.equal(controller.running, true);
    controller.setMoveInput(0, 0);
    controller.update(0.05);
    assert.equal(controller.moving, false);
    assert.equal(controller.running, false);
    controller.setMoveInput(NaN, Infinity, true);
    controller.update(0.05);
    assert.equal(controller.moving, false);
  });
});

test('blur, typing focus, disabled state, and teleport all clear held controls', () => {
  withController((controller, events) => {
    for (const reset of [
      () => events.dispatchEvent(new Event('blur')),
      () => {
        const event = new Event('focusin');
        Object.defineProperty(event, 'target', { value: new HTMLElement() });
        events.dispatchEvent(event);
      },
      () => {
        controller.enabled = false;
        controller.enabled = true;
      },
      () => controller.teleport(controller.x, controller.z),
    ]) {
      key(events, 'keydown', 'KeyW');
      key(events, 'keydown', 'ShiftLeft');
      controller.setMoveInput(1, 0, true);
      reset();
      const before = { x: controller.x, z: controller.z };
      controller.update(0.05);
      assert.deepEqual({ x: controller.x, z: controller.z }, before);
      assert.equal(controller.moving, false);
      assert.equal(controller.running, false);
    }
  });
});

test('server reconciliation preserves the destination and held movement input', () => {
  withController((controller, events) => {
    assert.ok(controller.setTarget(0, -6.2));
    for (let frame = 0; frame < 30; frame++) controller.update(0.05);
    controller.reconcile(controller.x, controller.z + 0.25);
    assert.deepEqual(controller.target, { x: 0, z: -6.2 });
    events.dispatchEvent(new Event('blur'));
    const focusEvent = new Event('focusin');
    Object.defineProperty(focusEvent, 'target', { value: new HTMLElement() });
    events.dispatchEvent(focusEvent);
    assert.deepEqual(controller.target, { x: 0, z: -6.2 });
    for (let frame = 0; frame < 200; frame++) controller.update(0.05);
    assert.ok(Math.hypot(controller.x, controller.z + 6.2) < 0.04);
    controller.teleport(0, 17);
    key(events, 'keydown', 'KeyW');
    controller.reconcile(0, 17.1);
    controller.update(0.05);
    assert.equal(controller.moving, true);
    assert.ok(controller.z < 17.1);
  });
});

test('prediction pause preserves navigation and held keys while the camera keeps updating', () => {
  withController((controller, events, camera) => {
    assert.ok(controller.setTarget(0, 12));
    const cameraBefore = camera.position.clone();
    for (let frame = 0; frame < 30; frame++) controller.update(0.05, false);
    assert.deepEqual({ x: controller.x, z: controller.z }, { x: 0, z: 17 });
    assert.deepEqual(controller.target, { x: 0, z: 12 });
    assert.equal(controller.enabled, true);
    assert.equal(controller.moving, false);
    assert.ok(camera.position.distanceTo(cameraBefore) > 0.1, 'network latency must not freeze the camera');
    controller.update(0.05, true);
    assert.ok(controller.z < 17, 'the original destination resumes without another click');

    controller.teleport(0, 17);
    key(events, 'keydown', 'KeyW');
    key(events, 'keydown', 'ShiftLeft');
    for (let frame = 0; frame < 30; frame++) controller.update(0.05, false);
    assert.deepEqual({ x: controller.x, z: controller.z }, { x: 0, z: 17 });
    assert.equal(controller.moving, false);
    controller.update(0.05, true);
    assert.ok(Math.abs(Math.hypot(controller.x, controller.z - 17) - 0.29) < 1e-8);
    assert.equal(controller.running, true, 'held movement and Shift survive the prediction pause');
    key(events, 'keyup', 'KeyW');
    key(events, 'keyup', 'ShiftLeft');
    controller.update(0.05, true);
    assert.equal(controller.moving, false);
  });
});

test('a late correction after local arrival resumes the destination, while explicit cancellation stays cancelled', () => {
  withController((controller) => {
    controller.teleport(0, 17);
    controller.setTarget(0, 12);
    for (let frame = 0; frame < 40; frame++) controller.update(0.05);
    assert.equal(controller.navigating, false);
    assert.equal(controller.z, 12);
    controller.reconcile(0, 14);
    assert.deepEqual(controller.target, { x: 0, z: 12 });
    for (let frame = 0; frame < 25; frame++) controller.update(0.05);
    assert.equal(controller.z, 12);
    controller.target = null;
    controller.reconcile(0, 14);
    controller.update(0.05);
    assert.equal(controller.navigating, false);
    assert.equal(controller.z, 14);
  });
});

test('running input cannot tunnel through pond, pillars, or world bounds', () => {
  withController((controller) => {
    for (const origin of [
      { x: -22, z: 4 },
      { x: -10.5, z: 8.5 },
      { x: 26.5, z: 15 },
    ]) {
      controller.teleport(origin.x, origin.z);
      controller.setMoveInput(1, 0, true);
      for (let frame = 0; frame < 100; frame++) {
        controller.update(0.05);
        assert.ok(walkable(controller.x, controller.z));
      }
    }
  });
});
