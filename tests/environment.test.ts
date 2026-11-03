import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createEnvironment, type Environment } from '../src/scene/environment';
import { SEATS, OBSTACLES, INTERACTION_POINTS, groundHeight, walkable } from '../shared/world';
import { findPath, clearPath } from '../src/scene/controller';

let environment: Environment;
before(() => {
  environment = createEnvironment();
  environment.group.updateMatrixWorld(true);
});
after(() => environment.dispose());

test('every server cushion has exactly one correctly positioned raycast mesh', () => {
  const seats = environment.pickables.filter((o) => o.userData.seatId);
  assert.equal(seats.length, 12);
  assert.equal(new Set(seats.map((o) => o.userData.seatId)).size, SEATS.length);
  for (const seat of SEATS) {
    const visual = seats.find((o) => o.userData.seatId === seat.id);
    assert.ok(visual, seat.id);
    assert.equal(visual.position.x, seat.x);
    assert.equal(visual.position.z, seat.z);
    assert.ok(walkable(seat.x, seat.z), 'Cushions must not overlap solid obstacles');
    const ray = new THREE.Raycaster(new THREE.Vector3(seat.x, 10, seat.z), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObjects(environment.pickables)[0];
    assert.equal(hit.object.userData.seatId, seat.id, 'Cushion must be picked before floor underneath');
    assert.ok(hit.point.y > groundHeight(seat.x, seat.z));
  }
});

test('raycast navigation floors align with shared stair and hall heights', () => {
  for (const p of [
    { x: 0, z: 17 },
    { x: 0, z: 11.5 },
    { x: 0, z: 10.5 },
    { x: 0, z: 9.5 },
    { x: 0, z: 7 },
    { x: 8, z: -7 },
  ]) {
    const ray = new THREE.Raycaster(new THREE.Vector3(p.x, 12, p.z), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObjects(environment.pickables.filter((o) => o.userData.ground))[0];
    assert.ok(hit, `Missing ground at ${JSON.stringify(p)}`);
    assert.ok(
      Math.abs(hit.point.y - groundHeight(p.x, p.z)) < 0.03,
      `Wrong elevation at ${JSON.stringify(p)}`,
    );
  }
});

test('visible hall columns coincide with shared collision centers', () => {
  const hall = environment.group.getObjectByName('main-hall');
  assert.ok(hall);
  const columns = OBSTACLES.filter((o) => o.hx === 0.57 && o.hz === 0.57);
  assert.equal(columns.length, 8);
  for (const column of columns) {
    const ray = new THREE.Raycaster(
      new THREE.Vector3(column.x, 3, column.z + 1),
      new THREE.Vector3(0, 0, -1),
      0,
      2,
    );
    const hit = ray.intersectObject(hall, true)[0];
    assert.ok(hit, `No visible column at ${column.x},${column.z}`);
    assert.ok(Math.abs(hit.point.x - column.x) < column.hx);
    assert.ok(Math.abs(hit.point.z - column.z) < column.hz);
    assert.equal(walkable(column.x, column.z), false);
  }
  // Collider footprints contain their platforms and pool center.
  for (const p of [
    { x: 0, z: -10 },
    { x: 14, z: 13 },
    { x: -16, z: 4 },
    { x: 16, z: -6 },
  ])
    assert.equal(walkable(p.x, p.z), false);
});

test('occupation changes only claimed cushions and restores available appearance', () => {
  const first = environment.group.getObjectByName(SEATS[0].id) as THREE.Mesh;
  const second = environment.group.getObjectByName(SEATS[1].id) as THREE.Mesh;
  const ring = environment.group.getObjectByName(`${SEATS[0].id}-availability`)!;
  const free = first.material;
  environment.setOccupied({ [SEATS[0].id]: 'player-a' });
  assert.equal(first.userData.occupied, true);
  assert.equal(ring.visible, false);
  assert.notEqual(first.material, free);
  assert.equal(second.material, free);
  environment.setOccupied({});
  assert.equal(first.userData.occupied, false);
  assert.equal(ring.visible, true);
  assert.equal(first.material, free);
});

test('roof fades out inside hall, returns outside, and updates remain finite', () => {
  const roof = environment.group.getObjectByName('main-hall-roof')!;
  for (let i = 0; i < 120; i++) environment.update(i / 60, 1 / 60, { x: 0, z: 4 });
  assert.equal(roof.visible, false);
  for (let i = 0; i < 120; i++) environment.update(i / 60 + 2, 1 / 60, { x: 0, z: 17 });
  assert.equal(roof.visible, true);
  roof.traverse((o) => {
    if (o instanceof THREE.Mesh) assert.ok((o.material as THREE.Material).opacity > 0.98);
  });
  environment.group.traverse((o) => {
    if (o instanceof THREE.Points) {
      const positions = o.geometry.attributes.position.array;
      for (const p of positions) assert.ok(Number.isFinite(p));
    }
  });
});

test('scene batches decorative geometry and disposes each active GPU resource once', () => {
  const local = createEnvironment(),
    geometries = new Set<THREE.BufferGeometry>(),
    materials = new Set<THREE.Material>(),
    textures = new Set<THREE.Texture>();
  let meshes = 0,
    instances = 0,
    disposedGeometry = 0,
    disposedMaterial = 0,
    disposedTexture = 0;
  // Activated effects use the same resources and must still be disposed exactly once.
  local.update(100, 1 / 60, { x: 0, z: 17 });
  local.triggerInteraction('bell', 0.5);
  local.triggerInteraction('lantern', 12);
  local.update(101, 1 / 60, { x: 0, z: 17 });
  local.resetInteractions();
  local.group.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
      geometries.add(o.geometry);
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => materials.add(m));
      if (o instanceof THREE.Mesh) meshes++;
      if (o instanceof THREE.InstancedMesh) instances += o.count;
    }
  });
  // Two additional destinations and near/far foliage remain under a bounded scene budget.
  assert.ok(meshes <= 128, `Unexpected decorative draw-call growth: ${meshes}`);
  assert.ok(instances > 1000, 'Trees and grass should be batched rather than individual meshes');
  geometries.forEach((g) => g.addEventListener('dispose', () => disposedGeometry++));
  materials.forEach((m) => m.addEventListener('dispose', () => disposedMaterial++));
  materials.forEach((m) => {
    for (const value of Object.values(m)) if (value instanceof THREE.Texture) textures.add(value);
  });
  assert.equal(textures.size, 3, 'Wood, stone and cloth share only three tiny procedural textures');
  textures.forEach((texture) => {
    assert.ok(texture instanceof THREE.DataTexture);
    assert.equal(texture.image.width, 64);
    assert.equal(texture.image.height, 64);
    texture.addEventListener('dispose', () => disposedTexture++);
  });
  local.dispose();
  local.dispose();
  assert.equal(disposedGeometry, geometries.size);
  assert.equal(disposedMaterial, materials.size);
  assert.equal(disposedTexture, textures.size);
  assert.equal(local.group.children.length, 0);
});

test('bathhouse and craft fair are visible destinations with an open shared walking route', () => {
  const bath = environment.group.getObjectByName('bathhouse');
  const market = environment.group.getObjectByName('tea-and-craft-fair');
  assert.ok(bath && market);
  const segments = [
    // Pass north of the entrance lantern post, then clear the market counters.
    [0, 18.9, -8, 18.9],
    [-8, 18.9, -14.5, 19.2],
    [-14.5, 19.2, -21, 19.2],
    [22, 20, 22, -12],
    [22, -12, 21, -12.6],
    [21, -12.6, 21, -17.6],
    [-23, -12.8, -21.5, 13.5],
    [-21.5, 13.5, -21, 20],
  ];
  for (const [ax, az, bx, bz] of segments)
    for (let step = 0; step <= 80; step++) {
      const t = step / 80,
        x = ax + (bx - ax) * t,
        z = az + (bz - az) * t;
      assert.ok(walkable(x, z), `Route blocked at ${x.toFixed(2)}, ${z.toFixed(2)}`);
    }
  for (const [object, x, z] of [
    [bath, 19.2, -17.3],
    [bath, 22.8, -17.3],
    [market, -24.6, 17.4],
    [market, -21, 24.8],
  ] as const) {
    assert.equal(walkable(x, z), false, 'Tubs and shop counters must have server collision');
    const ray = new THREE.Raycaster(new THREE.Vector3(x, 3, z), new THREE.Vector3(0, -1, 0));
    assert.ok(ray.intersectObject(object, true).length > 0, 'Collider must match actual scene geometry');
  }
  environment.update(1, 1 / 60, { x: 21, z: -16 });
  assert.equal(environment.group.getObjectByName('bathhouse-roof')!.visible, false);
  environment.update(2, 1 / 60, { x: 21, z: -11 });
  assert.equal(environment.group.getObjectByName('bathhouse-roof')!.visible, true);
});

test('quality tiers reduce particle, grass and shadow cost while distant trees use fewer tiers', () => {
  const grass = environment.group.getObjectByName('garden-grass') as THREE.InstancedMesh;
  const near = environment.group.getObjectByName('forest-near-crowns') as THREE.InstancedMesh;
  const far = environment.group.getObjectByName('forest-distant-crowns') as THREE.InstancedMesh;
  const motes = environment.group.getObjectByName('ambient-motes') as THREE.Points;
  const steam = environment.group.getObjectByName('bath-steam')!;
  environment.setQuality('high');
  environment.update(10, 1 / 60, { x: 0, z: 17 });
  const highGrass = grass.count,
    highCrowns = near.count + far.count;
  assert.ok(near.count > 0 && far.count > 0, 'LOD must render near and distant trees together');
  assert.equal(motes.geometry.drawRange.count, 130);
  assert.equal(steam.visible, true);
  environment.setQuality('low');
  environment.update(11, 1 / 60, { x: 0, z: 17 });
  assert.ok(grass.count < highGrass * 0.3);
  assert.ok(near.count + far.count < highCrowns);
  assert.equal(motes.geometry.drawRange.count, 26);
  assert.equal(steam.visible, false);
  environment.group.traverse((o) => {
    if (o instanceof THREE.Mesh) assert.equal(o.castShadow, false);
  });
  assert.ok(grass.frustumCulled && near.frustumCulled && far.frustumCulled);
  environment.setQuality('medium');
  assert.equal(motes.geometry.drawRange.count, 78);
  assert.ok(grass.count > highGrass * 0.5 && grass.count < highGrass * 0.7);
  environment.setQuality('high');
});

test('micro-surface textures retain UVs and lantern movement stays subtle', () => {
  environment.group.traverse((o) => {
    if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial && o.material.bumpMap) {
      assert.ok(o.geometry.attributes.uv, 'Textured mesh must retain texture coordinates after baking');
      assert.ok(o.material.bumpScale <= 0.05, 'Material depth should remain gentle');
    }
  });
  const lantern = environment.group.getObjectByName('swaying-lantern')!;
  environment.update(12, 1 / 60, { x: 0, z: 17 });
  const before = lantern.rotation.z;
  environment.update(13, 1 / 60, { x: 0, z: 17 });
  assert.notEqual(lantern.rotation.z, before);
  assert.ok(Math.abs(lantern.rotation.z) < 0.04);
});

test('bell and lantern interaction approaches are reachable without crossing shared obstacles', () => {
  for (const kind of ['bell', 'lantern'] as const) {
    const destination = INTERACTION_POINTS[kind];
    assert.ok(walkable(destination.x, destination.z), `${kind} approach is blocked`);
    const route = findPath({ x: 0, z: 17 }, destination);
    assert.ok(route, `${kind} has no arrival route`);
    let previous = { x: 0, z: 17 };
    for (const point of route) {
      assert.ok(clearPath(previous, point), `${kind} route crosses a solid obstacle`);
      previous = point;
    }
    assert.ok(Math.hypot(previous.x - destination.x, previous.z - destination.z) < 0.01);
  }
});

test('shared bell starts, replays elapsed age, and returns to its neutral position after eight seconds', () => {
  const bell = environment.group.getObjectByName('shared-temple-bell');
  assert.ok(bell, 'The shared bell must be an independently animated visual node');
  environment.resetInteractions();
  environment.update(100, 1 / 60, { x: 0, z: 17 });
  assert.equal(bell.userData.active, false);
  assert.equal(bell.rotation.z, 0);
  environment.triggerInteraction('bell', 0);
  assert.equal(bell.userData.active, true);
  environment.update(100.5, 1 / 60, { x: 0, z: 17 });
  const liveAngle = bell.rotation.z;
  assert.ok(Number.isFinite(liveAngle) && Math.abs(liveAngle) > 0.001 && Math.abs(liveAngle) <= 0.14);
  environment.resetInteractions();
  environment.update(200, 1 / 60, { x: 0, z: 17 });
  environment.triggerInteraction('bell', 0.5);
  assert.ok(Math.abs(bell.rotation.z - liveAngle) < 1e-9, 'Late snapshots must resume the same bell motion');
  environment.update(207.49, 1 / 60, { x: 0, z: 17 });
  assert.equal(bell.userData.active, true);
  environment.update(207.5, 1 / 60, { x: 0, z: 17 });
  assert.equal(bell.userData.active, false);
  assert.equal(bell.rotation.z, 0);
});

test('floating lantern remains finite over its lifetime, replays age, fades and expires', () => {
  const lantern = environment.group.getObjectByName('shared-floating-lantern');
  assert.ok(lantern, 'The floating lantern must exist before an interaction event');
  environment.resetInteractions();
  environment.update(300, 1 / 60, { x: 0, z: 17 });
  assert.equal(lantern.visible, false);
  environment.triggerInteraction('lantern', 0);
  assert.equal(lantern.visible, true);
  const start = lantern.position.clone();
  let middle = new THREE.Vector3();
  for (const age of [0, 0.5, 5, 30, 57, 59.9]) {
    environment.update(300 + age, 1 / 60, { x: 0, z: 17 });
    lantern.updateMatrixWorld(true);
    assert.equal(lantern.visible, true);
    assert.ok(lantern.matrixWorld.elements.every(Number.isFinite));
    assert.ok(lantern.position.y > 0 && lantern.position.y < 0.3, 'Lantern floats above the pond surface');
    assert.ok(lantern.scale.x > 0 && lantern.scale.x <= 1);
    if (age === 30) middle = lantern.position.clone();
  }
  assert.ok(middle.distanceTo(start) > 1, 'Lantern should visibly drift after launch');
  assert.ok(lantern.scale.x < 0.1, 'Lantern fades out before its lifetime ends');
  environment.update(360, 1 / 60, { x: 0, z: 17 });
  assert.equal(lantern.visible, false);
  environment.update(400, 1 / 60, { x: 0, z: 17 });
  environment.triggerInteraction('lantern', 30);
  assert.equal(lantern.visible, true);
  assert.ok(lantern.position.distanceTo(middle) < 1e-9, 'Late snapshots must resume the same drift position');
  environment.resetInteractions();
});

test('interaction reset and stale ages hide effects without allocating replacement GPU resources', () => {
  const bell = environment.group.getObjectByName('shared-temple-bell')!;
  const lantern = environment.group.getObjectByName('shared-floating-lantern')!;
  const resources = () => {
    const geometries = new Set<THREE.BufferGeometry>(),
      materials = new Set<THREE.Material>();
    environment.group.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material])
          materials.add(material);
      }
    });
    return { geometries, materials };
  };
  const before = resources();
  environment.update(500, 1 / 60, { x: 0, z: 17 });
  environment.triggerInteraction('bell', 0.5);
  environment.triggerInteraction('lantern', 12);
  assert.equal(bell.userData.active, true);
  assert.equal(lantern.visible, true);
  environment.resetInteractions();
  assert.equal(bell.userData.active, false);
  assert.equal(bell.rotation.z, 0);
  assert.equal(lantern.visible, false);
  environment.update(501, 1 / 60, { x: 0, z: 17 });
  assert.equal(bell.rotation.z, 0);
  assert.equal(lantern.visible, false);
  for (const age of [60, 1000, Infinity, NaN]) {
    environment.triggerInteraction('bell', age);
    environment.triggerInteraction('lantern', age);
    assert.equal(bell.userData.active, false);
    assert.equal(bell.rotation.z, 0);
    assert.equal(lantern.visible, false);
    assert.ok([...bell.rotation.toArray().slice(0, 3), ...lantern.position.toArray()].every(Number.isFinite));
  }
  environment.triggerInteraction('bell', -1);
  environment.triggerInteraction('lantern', -1);
  assert.equal(bell.userData.active, true, 'Clock skew clamps a negative age to the start');
  assert.equal(lantern.visible, true);
  environment.resetInteractions();
  const after = resources();
  assert.deepEqual(after.geometries, before.geometries);
  assert.deepEqual(after.materials, before.materials);
});

test('foreground courtyard canopy reveals the pond player and returns when the camera orbits away', () => {
  const lotus = environment.group.getObjectByName('courtyard-lotus-canopy')!;
  const blossom = environment.group.getObjectByName('courtyard-blossom-canopy')!;
  assert.ok(lotus && blossom);
  const player = { x: 8.4, z: 13 };
  const objects: string[] = [];
  environment.group.traverse((object) => objects.push(object.uuid));
  environment.update(600, 1 / 60, player, new THREE.Vector3(15.35, 11.4, 28.56));
  assert.equal(lotus.visible, false, 'Pond follow camera must not look through an opaque tree canopy');
  assert.equal(blossom.visible, true, 'Unrelated courtyard foliage stays visible');
  environment.update(600.02, 1 / 60, player, new THREE.Vector3(1.45, 11.4, -2.56));
  assert.equal(lotus.visible, true, 'Orbiting away restores foliage immediately');
  const after: string[] = [];
  environment.group.traverse((object) => after.push(object.uuid));
  assert.deepEqual(after, objects, 'Camera changes reuse scene objects');
});

test('foreground forest crowns clear the camera corridor at every quality and restore without moving trunks', () => {
  const trunks = environment.group.getObjectByName('forest-trunks') as THREE.InstancedMesh;
  const near = environment.group.getObjectByName('forest-near-crowns') as THREE.InstancedMesh;
  const far = environment.group.getObjectByName('forest-distant-crowns') as THREE.InstancedMesh;
  const matrix = new THREE.Matrix4();
  trunks.getMatrixAt(0, matrix);
  const x = matrix.elements[12],
    z = matrix.elements[14],
    scale = matrix.elements[0];
  const player = { x, z: z - 8 };
  const camera = new THREE.Vector3(x, scale * 8, z + 8);
  const originalTrunks = Array.from(trunks.instanceMatrix.array);
  for (const [index, quality] of (['low', 'medium', 'high'] as const).entries()) {
    environment.setQuality(quality);
    const time = 700 + index * 10;
    environment.update(time, 1 / 60, player);
    const allCrowns = near.count + far.count;
    environment.update(time + 1, 1 / 60, player, camera);
    assert.ok(near.count + far.count < allCrowns, `${quality}: blocking crown must be omitted`);
    environment.update(time + 2, 1 / 60, player);
    assert.equal(near.count + far.count, allCrowns, `${quality}: all foliage restores`);
  }
  assert.deepEqual(Array.from(trunks.instanceMatrix.array), originalTrunks);
});
