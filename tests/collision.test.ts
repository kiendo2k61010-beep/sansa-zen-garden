import assert from 'node:assert/strict';
import test from 'node:test';
import { PerspectiveCamera } from 'three';
import { INTERACTION_POINTS, LANDMARKS, SEATS, walkable } from '../shared/world';
import { clearPath, findPath, PlayerController, type Point } from '../src/scene/controller';

// These dimensions come from the visible meshes in architecture.ts / nature.ts,
// rather than enumerating OBSTACLES (which could silently omit the same object).
const physicalObjects = [
  ...[-9.5, 9.5].flatMap((x) =>
    [-8, -0.5, 5.7].map((z) => ({ name: 'hall side screen', x, z, hx: 0.09, hz: 1.9 })),
  ),
  ...[-9.5, 9.5].flatMap((x) =>
    [-11, -4, 3, 8.5].map((z) => ({ name: 'hall pillar plinth', x, z, hx: 0.57, hz: 0.57 })),
  ),
  ...[-4.3, 4.3].map((x) => ({ name: 'rear inner column', x, z: -12.1, hx: 0.23, hz: 0.23 })),
  ...[-6.9, 6.9].flatMap((x) =>
    [12.4, 20, 26].map((z) => ({ name: 'stone lantern base', x, z, hx: 0.45, hz: 0.45 })),
  ),
  { name: 'bath rear wall', x: 21, z: -19.2, hx: 3.6, hz: 0.1 },
  ...[17.4, 24.6].map((x) => ({ name: 'bath side wall', x, z: -16.2, hx: 0.105, hz: 3 })),
  ...[18.5, 23.5].map((x) => ({ name: 'bath front screen', x, z: -13.2, hx: 1.1, hz: 0.12 })),
  ...[17.4, 24.6].flatMap((x) =>
    [-19.2, -13.2].map((z) => ({ name: 'bath stone foot', x, z, hx: 0.27, hz: 0.27 })),
  ),
  ...[19.2, 22.8].map((x) => ({ name: 'bath tub rim', x, z: -17.3, hx: 1.15, hz: 1.15 })),
  { name: 'bath stove', x: 21, z: -18.7, hx: 0.45, hz: 0.4 },
  ...[
    { x: -24.6, z: 17.4 },
    { x: -17.4, z: 17.4 },
    { x: -21, z: 24.8 },
  ].map((point) => ({ name: 'market counter', ...point, hx: 1.6, hz: 0.975 })),
];

function withController(run: (controller: PlayerController) => void) {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { value: new EventTarget(), configurable: true });
  const canvas = Object.assign(new EventTarget(), { style: {} }) as unknown as HTMLCanvasElement;
  const controller = new PlayerController(new PerspectiveCamera(), canvas, () => {});
  try {
    run(controller);
  } finally {
    controller.dispose();
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
}

// resetCamera establishes yaw=0.42; invert camera-relative joystick axes to
// test a deliberate world-axis push directly into each physical barrier.
function pushToward(controller: PlayerController, dx: number, dz: number) {
  controller.resetCamera();
  controller.setMoveInput(
    Math.cos(0.42) * dx - Math.sin(0.42) * dz,
    -Math.sin(0.42) * dx - Math.cos(0.42) * dz,
    true,
  );
}

test('visible hall screens, columns, lanterns, bath fixtures and counters have solid footprints', () => {
  for (const object of physicalObjects) {
    assert.equal(walkable(object.x, object.z), false, `${object.name} centre is passable`);
    // Axis faces of circular bases/tubs and box walls must protect the 0.43m robe.
    for (const [dx, dz] of [
      [object.hx + 0.4, 0],
      [-object.hx - 0.4, 0],
      [0, object.hz + 0.4],
      [0, -object.hz - 0.4],
    ]) {
      assert.equal(
        walkable(object.x + dx, object.z + dz),
        false,
        `${object.name} permits robe overlap at ${object.x + dx},${object.z + dz}`,
      );
    }
  }
});

test('manual running cannot pass through screens, rear columns, lantern posts, bath walls/tubs or market furniture even with large dt', () => {
  const pushes = [
    ...[-8, -0.5, 5.7].flatMap((z) => [
      {
        name: 'east side screen',
        from: { x: 8, z },
        dx: 1,
        dz: 0,
        axis: 'x' as const,
        boundary: 8.97,
        sign: 1,
      },
      {
        name: 'west side screen',
        from: { x: -8, z },
        dx: -1,
        dz: 0,
        axis: 'x' as const,
        boundary: -8.97,
        sign: -1,
      },
    ]),
    {
      name: 'right rear column',
      from: { x: 5.5, z: -12.1 },
      dx: -1,
      dz: 0,
      axis: 'x' as const,
      boundary: 4.96,
      sign: -1,
    },
    {
      name: 'left rear column',
      from: { x: -5.5, z: -12.1 },
      dx: 1,
      dz: 0,
      axis: 'x' as const,
      boundary: -4.96,
      sign: 1,
    },
    ...[12.4, 20, 26].flatMap((z) => [
      {
        name: 'right stone lantern',
        from: { x: 5.5, z },
        dx: 1,
        dz: 0,
        axis: 'x' as const,
        boundary: 6.02,
        sign: 1,
      },
      {
        name: 'left stone lantern',
        from: { x: -5.5, z },
        dx: -1,
        dz: 0,
        axis: 'x' as const,
        boundary: -6.02,
        sign: -1,
      },
    ]),
    {
      name: 'bath west wall',
      from: { x: 16, z: -16.2 },
      dx: 1,
      dz: 0,
      axis: 'x' as const,
      boundary: 16.85,
      sign: 1,
    },
    {
      name: 'bath east wall',
      from: { x: 26, z: -16.2 },
      dx: -1,
      dz: 0,
      axis: 'x' as const,
      boundary: 25.15,
      sign: -1,
    },
    {
      name: 'bath rear wall',
      from: { x: 21, z: -20.5 },
      dx: 0,
      dz: 1,
      axis: 'z' as const,
      boundary: -19.75,
      sign: 1,
    },
    ...[18.5, 23.5].map((x) => ({
      name: 'bath front screen',
      from: { x, z: -12 },
      dx: 0,
      dz: -1,
      axis: 'z' as const,
      boundary: -12.65,
      sign: -1,
    })),
    {
      name: 'left tub',
      from: { x: 21, z: -17.3 },
      dx: -1,
      dz: 0,
      axis: 'x' as const,
      boundary: 20.78,
      sign: -1,
    },
    {
      name: 'right tub',
      from: { x: 21, z: -17.3 },
      dx: 1,
      dz: 0,
      axis: 'x' as const,
      boundary: 21.22,
      sign: 1,
    },
    {
      name: 'bath stove',
      from: { x: 21, z: -17.4 },
      dx: 0,
      dz: -1,
      axis: 'z' as const,
      boundary: -17.87,
      sign: -1,
    },
    ...[-24.6, -17.4].map((x) => ({
      name: 'market side counter',
      from: { x, z: 19.8 },
      dx: 0,
      dz: -1,
      axis: 'z' as const,
      boundary: 18.93,
      sign: -1,
    })),
    {
      name: 'market rear counter',
      from: { x: -21, z: 22 },
      dx: 0,
      dz: 1,
      axis: 'z' as const,
      boundary: 23.27,
      sign: 1,
    },
    ...[-24.6, -17.4].map((x) => ({
      name: 'market bench',
      from: { x, z: 21.8 },
      dx: 0,
      dz: 1,
      axis: 'z' as const,
      boundary: 22.22,
      sign: 1,
    })),
  ];
  withController((controller) => {
    for (const push of pushes)
      for (const dt of [1 / 60, 0.05, 1, 5]) {
        assert.ok(walkable(push.from.x, push.from.z), `${push.name}: invalid fixture start`);
        controller.teleport(push.from.x, push.from.z);
        pushToward(controller, push.dx, push.dz);
        for (let frame = 0; frame < 120; frame++) {
          const previous = { x: controller.x, z: controller.z };
          controller.update(dt);
          assert.ok(walkable(controller.x, controller.z), `${push.name}: entered geometry at dt=${dt}`);
          assert.ok(clearPath(previous, controller), `${push.name}: tunnelled between frames at dt=${dt}`);
          assert.ok(
            (controller[push.axis] - push.boundary) * push.sign <= 1e-8,
            `${push.name}: crossed barrier at dt=${dt}`,
          );
        }
        assert.ok(
          Math.hypot(controller.x - push.from.x, controller.z - push.from.z) > 0.1,
          `${push.name}: controller never moved toward barrier`,
        );
      }
  });
});

test('all landmarks, interaction points and twelve seats remain reachable with robe clearance', () => {
  const gate: Point = { x: 0, z: 17 };
  const destinations = [
    ...LANDMARKS.map((point) => ({ ...point, label: point.name })),
    ...SEATS.map((point) => ({ ...point, label: point.id })),
    ...Object.entries(INTERACTION_POINTS).map(([label, point]) => ({ ...point, label })),
  ];
  withController((controller) => {
    for (const destination of destinations) {
      const target = { x: destination.x, z: destination.z };
      const route = findPath(gate, target);
      assert.ok(route, `${destination.label}: no collision-free route from arrival gate`);
      let previous = gate;
      for (const waypoint of route) {
        assert.ok(clearPath(previous, waypoint), `${destination.label}: route cuts a solid corner`);
        previous = waypoint;
      }
      controller.teleport(gate.x, gate.z);
      assert.equal(controller.setTarget(target.x, target.z), true);
      let frames = 0;
      while (controller.navigating && frames++ < 4000) {
        controller.update(0.05);
        assert.ok(walkable(controller.x, controller.z), `${destination.label}: route entered collider`);
      }
      assert.ok(frames < 4000, `${destination.label}: route stalls`);
      assert.ok(
        Math.hypot(controller.x - target.x, controller.z - target.z) < 0.001,
        `${destination.label}: did not arrive`,
      );
    }
  });
});
