import * as THREE from 'three';
import type { WorldInteractionKind } from '../../shared/world';
import {
  bake,
  beam,
  box,
  cyl,
  ellipsoid,
  lantern,
  lotus,
  material,
  mats,
  roof,
  shape,
  surfaceMaterial,
  taper,
} from './architecture';

function random(seed = 732) {
  let n = seed;
  return () => {
    n = (n * 1664525 + 1013904223) >>> 0;
    return n / 4294967296;
  };
}
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// Reserve the two new destinations and the east/west connecting paths for people.
function explorationClearing(x: number, z: number) {
  return (
    (x > 16 && x < 26 && z > -21 && z < -11) ||
    (x > -27 && x < -15 && z > 14 && z < 28) ||
    (x > 20.5 && x < 23.5 && z > -13 && z < 13) ||
    (x > -23 && x < -3 && z > 19 && z < 22) ||
    (x > -25 && x < -11 && z > -15 && z < -11) ||
    (x > -24 && x < -20 && z > -14 && z < 20)
  );
}

function createExplorationZones() {
  const bath = new THREE.Group(),
    bathRoof = new THREE.Group(),
    market = new THREE.Group();
  const moving = new THREE.Group(),
    lanterns: THREE.Group[] = [];
  const cloth = surfaceMaterial('#b5a07e', 'cloth'),
    cream = surfaceMaterial('#ddd6b9', 'cloth');
  const sage = surfaceMaterial('#839782', 'cloth'),
    ceramic = material('#728b81', 0.5);
  const water = material('#85aaa0', 0.24, 0.12);
  // A quiet cedar bathhouse, with a clear central aisle and an open southern doorway.
  for (let i = 0; i < 22; i++)
    box(bath, i % 3 === 0 ? mats.woodLight : mats.wood, [17.55 + i * 0.33, -0.025, -16.2], [0.31, 0.05, 5.8]);
  box(bath, mats.plaster, [21, 1.45, -19.2], [7.2, 2.9, 0.2]);
  for (const x of [17.4, 24.6]) {
    box(bath, mats.woodDark, [x, 1.35, -16.2], [0.17, 2.7, 6]);
    for (let i = 0; i < 25; i++) box(bath, mats.woodLight, [x, 1.6, -19.05 + i * 0.24], [0.21, 2.25, 0.075]);
  }
  for (const x of [18.5, 23.5]) {
    box(bath, mats.woodDark, [x, 1.25, -13.2], [2.2, 2.5, 0.18]);
    for (let i = 0; i < 9; i++)
      box(bath, mats.woodLight, [x - 1 + i * 0.25, 1.45, -13.08], [0.055, 2.05, 0.07]);
  }
  for (const x of [17.4, 24.6])
    for (const z of [-19.2, -13.2]) {
      cyl(bath, mats.stoneDark, [x, 0.16, z], [0.27, 0.32, 0.27]);
      box(bath, mats.wood, [x, 1.65, z], [0.22, 3.3, 0.22]);
      box(bath, mats.woodEnd, [x, 3.17, z], [0.65, 0.15, 0.55]);
    }
  box(bath, mats.woodDark, [21, 3.25, -13.2], [7.5, 0.22, 0.26]);
  box(bath, mats.woodDark, [21, 3.25, -19.2], [7.5, 0.22, 0.26]);
  roof(bathRoof, 21, -16.2, 8.3, 7.3, 3.35, 1.45);
  // Two lathed timber tubs with an actual recessed water surface, rims and staves.
  const profile = [
    [0, 0.1],
    [0.95, 0.1],
    [1.12, 0.22],
    [1.15, 0.8],
    [1.04, 0.89],
    [0.96, 0.78],
    [0.93, 0.27],
    [0, 0.27],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  for (const x of [19.2, 22.8]) {
    shape(bath, new THREE.LatheGeometry(profile, 28), mats.wood, [x, 0, -17.3]);
    shape(bath, new THREE.CircleGeometry(0.95, 32), water, [x, 0.7, -17.3], [1, 1, 1], [-Math.PI / 2, 0, 0]);
    for (const y of [0.28, 0.72])
      shape(
        bath,
        new THREE.TorusGeometry(1.11, 0.023, 5, 28),
        mats.woodDark,
        [x, y, -17.3],
        [1, 1, 1],
        [-Math.PI / 2, 0, 0],
      );
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2;
      box(
        bath,
        mats.woodLight,
        [x + Math.sin(angle) * 1.125, 0.5, -17.3 + Math.cos(angle) * 1.125],
        [0.025, 0.55, 0.018],
        [0, angle, 0],
      );
    }
    box(bath, cream, [x + 0.62, 0.94, -17.3], [0.48, 0.12, 0.75], [0, 0.15, 0]);
    box(bath, cloth, [x + 0.62, 1.015, -17.3], [0.43, 0.035, 0.72], [0, 0.15, 0]);
  }
  box(bath, mats.stoneDark, [21, 0.5, -18.7], [0.9, 1, 0.8]);
  box(bath, mats.woodDark, [21, 0.37, -18.28], [0.42, 0.35, 0.025]);
  cyl(bath, mats.stoneDark, [21, 2.2, -18.7], [0.12, 2.5, 0.12]);
  // Cloth door hanging stays above head height; no decorative obstacle spans the aisle.
  for (const dx of [-0.63, 0.63]) box(bath, sage, [21 + dx, 2.62, -13.13], [1.18, 0.66, 0.035]);
  for (const x of [20.36, 21.64])
    shape(bath, new THREE.TorusGeometry(0.13, 0.016, 5, 16), cream, [x, 2.63, -13.1]);

  // A modest tea-and-craft fair. All counters sit around, never across, the social square.
  const stalls = [
    { x: -24.6, z: 17.4 },
    { x: -17.4, z: 17.4 },
    { x: -21, z: 24.8 },
  ];
  stalls.forEach(({ x, z }, index) => {
    for (const dx of [-1.5, 1.5])
      for (const dz of [-0.95, 0.95]) box(market, mats.wood, [x + dx, 1.4, z + dz], [0.12, 2.8, 0.12]);
    box(market, mats.woodLight, [x, 0.94, z], [3.2, 0.13, 1.95]);
    box(market, mats.wood, [x, 0.49, z + 0.9], [3.1, 0.85, 0.09]);
    for (let i = 0; i < 9; i++)
      box(market, mats.woodDark, [x - 1.42 + i * 0.35, 0.49, z + 0.96], [0.018, 0.81, 0.018]);
    // The awning has a shallow curved cloth profile and scalloped sewn edges.
    const awning = new THREE.PlaneGeometry(3.8, 3.1, 8, 6);
    const pos = awning.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const depth = pos.getY(i);
      pos.setZ(i, 0.32 * Math.cos(((depth / 1.55) * Math.PI) / 2) + Math.sin(pos.getX(i) * 5) * 0.018);
    }
    awning.computeVertexNormals();
    const awningMat = index === 1 ? sage : cloth;
    awningMat.side = THREE.DoubleSide;
    shape(market, awning, awningMat, [x, 2.85, z], [1, 1, 1], [-Math.PI / 2, 0, 0]);
    for (let i = 0; i < 10; i++) {
      box(
        market,
        i % 2 === 0 ? cream : awningMat,
        [x - 1.71 + i * 0.38, 2.76, z + 1.55],
        [0.375, 0.22, 0.035],
      );
    }
    for (let i = 0; i < 5; i++) {
      const xx = x - 1.08 + i * 0.54;
      if (index === 0) {
        const bowl = [
          [0, 0],
          [0.11, 0],
          [0.23, 0.3],
          [0.21, 0.33],
          [0.1, 0.05],
          [0, 0.05],
        ].map(([a, b]) => new THREE.Vector2(a, b));
        shape(market, new THREE.LatheGeometry(bowl, 16), ceramic, [xx, 1.01, z]);
      } else if (index === 1) {
        cyl(market, ceramic, [xx, 1.18, z], [0.17, 0.32, 0.17]);
        cyl(market, mats.woodDark, [xx, 1.36, z], [0.185, 0.045, 0.185]);
        box(market, cream, [xx, 1.18, z + 0.172], [0.16, 0.14, 0.012]);
      } else {
        box(market, cream, [xx, 1.08, z], [0.4, 0.14, 0.7]);
        box(market, sage, [xx, 1.2, z], [0.37, 0.1, 0.66]);
      }
    }
  });
  for (const x of [-24.6, -17.4]) {
    box(market, mats.woodLight, [x, 0.48, 23], [2.6, 0.16, 0.7]);
    for (const dx of [-0.95, 0.95]) box(market, mats.wood, [x + dx, 0.21, 23], [0.15, 0.42, 0.52]);
    lantern(market, x, 2.3, 18.5, 0.66);
  }
  for (const [x, y, z] of [
    [19.6, 3.1, -12.9],
    [22.4, 3.1, -12.9],
  ]) {
    const source = new THREE.Group();
    lantern(source, 0, -0.55, 0, 0.66);
    source.traverse((o) => {
      if (o instanceof THREE.Mesh && o.material === mats.goldDark) o.material = mats.woodDark;
    });
    const hanging = bake(source);
    hanging.position.set(x, y, z);
    hanging.name = 'swaying-lantern';
    moving.add(hanging);
    lanterns.push(hanging);
  }
  const steamPositions = new Float32Array(28 * 3),
    steamGeometry = new THREE.BufferGeometry();
  steamGeometry.setAttribute('position', new THREE.BufferAttribute(steamPositions, 3));
  const steam = new THREE.Points(
    steamGeometry,
    new THREE.PointsMaterial({
      color: '#e3e5d6',
      size: 0.12,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
    }),
  );
  steam.name = 'bath-steam';
  steam.frustumCulled = false;
  moving.add(steam);
  const bathhouse = bake(bath),
    bathhouseRoof = bake(bathRoof),
    fair = bake(market);
  bathhouse.name = 'bathhouse';
  bathhouse.userData.landmark = 'bath';
  bathhouseRoof.name = 'bathhouse-roof';
  fair.name = 'tea-and-craft-fair';
  fair.userData.landmark = 'market';
  return {
    static: [bathhouse, bathhouseRoof, fair],
    moving,
    setQuality(quality: 'low' | 'medium' | 'high') {
      steam.visible = quality !== 'low';
      lanterns.forEach((l) =>
        l.traverse((o) => {
          if (o instanceof THREE.Mesh) o.castShadow = quality === 'high';
        }),
      );
    },
    update(time: number, player: { x: number; z: number }) {
      bathhouseRoof.visible = !(player.x > 17.6 && player.x < 24.4 && player.z > -19 && player.z < -12.7);
      lanterns.forEach((l, i) => {
        l.rotation.z = Math.sin(time * 0.65 + i * 0.9) * 0.036;
      });
      if (steam.visible) {
        for (let i = 0; i < 28; i++) {
          const phase = (i / 14 + time * 0.08) % 1;
          steamPositions[i * 3] =
            (i < 14 ? 19.2 : 22.8) + Math.sin(i * 2.4 + time * 0.15) * (0.25 + phase * 0.3);
          steamPositions[i * 3 + 1] = 0.76 + phase * 1.9;
          steamPositions[i * 3 + 2] = -17.3 + Math.cos(i * 1.7 + phase * 2) * 0.35;
        }
        steamGeometry.attributes.position.needsUpdate = true;
      }
    },
  };
}

export function createGardens() {
  const rand = random(),
    zones = createExplorationZones();
  const source = new THREE.Group(),
    living = new THREE.Group(),
    ground = new THREE.Group();
  const lawn = material('#a6b18b'),
    moss = material('#8e9f78'),
    earth = material('#7e8a69');
  const pebble = surfaceMaterial('#a7b2a1', 'stone'),
    darkStone = surfaceMaterial('#7f9286', 'stone'),
    pathStone = surfaceMaterial('#d2d1b7', 'stone');
  const blossom = material('#d6b8af'),
    leaf = material('#607e60'),
    leafLight = material('#7f956b'),
    pine = material('#456b59');
  const water = new THREE.MeshStandardMaterial({
    color: '#83aaa0',
    roughness: 0.3,
    metalness: 0.15,
    transparent: true,
    opacity: 0.88,
  });
  const floor = shape(
    ground,
    new THREE.PlaneGeometry(180, 180),
    lawn,
    [0, -0.025, 0],
    [1, 1, 1],
    [-Math.PI / 2, 0, 0],
  );
  floor.userData.ground = true;
  floor.castShadow = false;
  // Broad moss islands add quiet color variation to the garden floor.
  for (let i = 0; i < 38; i++) {
    const x = (rand() - 0.5) * 100,
      z = (rand() - 0.5) * 90;
    if ((Math.abs(x) < 12 && z > -16 && z < 13) || explorationClearing(x, z)) continue;
    const patch = cyl(
      source,
      i % 2 === 0 ? moss : earth,
      [x, -0.05, z],
      [2 + rand() * 5, 0.12, 2 + rand() * 4],
    );
    patch.rotation.y = rand() * 6;
  }
  // Stone paths extend through the courtyard and branch towards the quiet side gardens.
  for (let j = 0; j < 15; j++)
    for (let i = 0; i < 3; i++) {
      const z = 12 + j * 1.18,
        x = (i - 1) * 1.8 + Math.sin(j * 0.2) * 0.35;
      box(source, pathStone, [x, 0.025, z], [1.65, 0.09, 1.06], [0, (rand() - 0.5) * 0.045, 0]);
    }
  for (const side of [-1, 1])
    for (let i = 0; i < 15; i++) {
      const x = side * (3 + i * 0.9),
        z = 15 - Math.sin(((i / 15) * Math.PI) / 2) * (side < 0 ? 4.5 : 7);
      cyl(
        source,
        i % 3 === 0 ? pebble : pathStone,
        [x, 0.055, z],
        [0.56, 0.15, 0.48],
        [0, rand() * Math.PI, 0],
      );
      if (i % 2 === 0)
        cyl(source, pathStone, [x + side * 0.3, 0.04, z + 1], [0.53, 0.12, 0.39], [0, rand() * 3, 0]);
    }
  // Connected, quiet side walks keep every destination in the same walkable world.
  for (const [ax, az, bx, bz] of [
    [0, 20, -21, 20],
    [0, 20, 22, 20],
    [22, 20, 22, -12.2],
    [-11.4, -12.8, -23, -12.8],
    [-23, -12.8, -21.5, 13.5],
    [-21.5, 13.5, -21, 20],
  ]) {
    const length = Math.hypot(bx - ax, bz - az),
      count = Math.ceil(length / 1.1);
    for (let i = 0; i <= count; i++) {
      const t = i / count,
        x = ax + (bx - ax) * t,
        z = az + (bz - az) * t;
      box(
        source,
        i % 4 === 0 ? pebble : pathStone,
        [x, -0.015, z],
        [1.5, 0.04, 0.88],
        [0, -Math.atan2(bz - az, bx - ax) + Math.PI / 2 + (rand() - 0.5) * 0.05, 0],
      );
    }
  }
  for (let x = -25; x <= -17; x += 1.15)
    for (let z = 19.1; z <= 22.2; z += 1.1)
      box(source, Math.round(x * 3 + z) % 4 ? pathStone : pebble, [x, -0.018, z], [1.06, 0.04, 1.02]);
  // Low garden wall and gate frame the arrival view without blocking movement.
  for (const side of [-1, 1]) {
    box(source, mats.stoneDark, [side * 18, -0.03, 29], [22, 0.2, 0.8]);
    box(source, mats.plaster, [side * 18, 0.7, 29], [22, 1.4, 0.55]);
    box(source, mats.roofDark, [side * 18, 1.44, 29], [22.3, 0.12, 0.7]);
    for (let i = 0; i < 5; i++) box(source, mats.stone, [side * (7 + i * 5.5), 0.8, 29], [0.7, 1.7, 0.85]);
  }
  // Larger rocks flank the path; smaller stones ring planting beds.
  for (let i = 0; i < 75; i++) {
    let x = (rand() - 0.5) * 68,
      z = (rand() - 0.5) * 66;
    if (
      (Math.abs(x) < 12 && z < 13 && z > -17) ||
      (Math.abs(x) < 5 && z > 10) ||
      (x > 9 && x < 20 && z > 8 && z < 18) ||
      explorationClearing(x, z)
    )
      continue;
    const size = 0.25 + rand() * 0.7;
    const rock = shape(
      source,
      new THREE.DodecahedronGeometry(1, 0),
      i % 3 === 0 ? darkStone : pebble,
      [x, size * 0.25, z],
      [size, size * 0.65, size * 0.8],
      [rand(), rand() * 4, rand()],
    );
    rock.castShadow = true;
  }
  // Lotus pond, with an irregular stone border and a pair of shallow ripples.
  const pondBed = shape(
    source,
    new THREE.CylinderGeometry(1, 1, 1, 48),
    darkStone,
    [14, 0.015, 13],
    [4.9, 0.12, 3.7],
  );
  pondBed.castShadow = false;
  const pond = shape(
    living,
    new THREE.CircleGeometry(1, 64),
    water,
    [14, 0.085, 13],
    [4.45, 3.22, 1],
    [-Math.PI / 2, 0, 0],
  );
  pond.castShadow = false;
  for (let i = 0; i < 37; i++) {
    const a = (i / 37) * Math.PI * 2,
      s = 0.35 + rand() * 0.2;
    shape(
      source,
      new THREE.DodecahedronGeometry(1),
      i % 3 ? mats.stone : darkStone,
      [14 + Math.cos(a) * 4.65, 0.16, 13 + Math.sin(a) * 3.43],
      [s * 1.3, s * 0.75, s],
      [rand(), a, 0],
    );
  }
  const lily = material('#759777'),
    pink = material('#ddb1a7');
  for (let i = 0; i < 10; i++) {
    const a = rand() * 6.28,
      r = rand() * 2.8,
      x = 14 + Math.cos(a) * r,
      z = 13 + Math.sin(a) * r * 0.7;
    shape(
      source,
      new THREE.CircleGeometry(0.42, 18, 0, Math.PI * 1.87),
      lily,
      [x, 0.1, z],
      [1, 1, 1],
      [-Math.PI / 2, 0, a],
    );
    if (i % 2 === 0) lotus(source, x, 0.2, z, 0.36, pink);
  }
  const rippleMat = new THREE.MeshBasicMaterial({
    color: '#c2d8c3',
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });
  const ripples: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const ripple = shape(
      living,
      new THREE.RingGeometry(0.94, 1, 56),
      i === 0 ? rippleMat : rippleMat.clone(),
      [14, 0.105, 13],
      [1, 1, 1],
      [-Math.PI / 2, 0, 0],
    );
    ripple.castShadow = false;
    ripples.push(ripple);
  }
  // A small arched stone footbridge is scenery at the pond's far edge.
  for (let i = 0; i < 9; i++) {
    const a = (i / 8 - 0.5) * 1.5;
    box(
      source,
      mats.stone,
      [14 + Math.sin(a) * 3, 0.25 + Math.cos(a) * 0.55, 16],
      [0.7, 0.18, 1.12],
      [0, 0, -a * 0.48],
    );
  }
  // Bell pavilion: the bell is a lathed curved shape, not a plain cylinder.
  box(source, mats.stone, [-16, 0.2, 4], [7.1, 0.4, 9.4]);
  for (const x of [-18.8, -13.2])
    for (const z of [0.2, 7.8]) {
      cyl(source, mats.stoneDark, [x, 0.5, z], [0.37, 0.6, 0.37]);
      cyl(source, mats.wood, [x, 2.8, z], [0.23, 4.5, 0.23]);
      box(source, mats.woodEnd, [x, 4.85, z], [0.9, 0.2, 0.9]);
    }
  for (const z of [0.2, 7.8]) box(source, mats.woodDark, [-16, 5, z], [6.1, 0.3, 0.3]);
  for (const x of [-18.8, -13.2]) box(source, mats.woodDark, [x, 5, 4], [0.3, 0.3, 8.2]);
  roof(source, -16, 4, 9, 10.8, 5.05, 1.8);
  const bellProfile = [
    new THREE.Vector2(0, 1.4),
    new THREE.Vector2(0.35, 1.4),
    new THREE.Vector2(0.48, 1.2),
    new THREE.Vector2(0.55, 0.4),
    new THREE.Vector2(0.78, 0.1),
    new THREE.Vector2(0.8, 0),
    new THREE.Vector2(0.63, 0.04),
    new THREE.Vector2(0.5, 0.35),
    new THREE.Vector2(0.37, 1.1),
    new THREE.Vector2(0, 1.2),
  ];
  const bellSource = new THREE.Group();
  shape(bellSource, new THREE.LatheGeometry(bellProfile, 24), mats.goldDark, [0, -1.85, 0], [1.3, 1.3, 1.3]);
  cyl(source, mats.woodDark, [-16, 4.3, 4], [0.04, 0.7, 0.04]);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    ellipsoid(bellSource, mats.gold, [Math.sin(a) * 0.69, -0.95, Math.cos(a) * 0.69], [0.07, 0.07, 0.07]);
  }
  const bell = bake(bellSource);
  bell.name = 'shared-temple-bell';
  bell.position.set(-16, 4.35, 4);
  living.add(bell);
  const floatingSource = new THREE.Group();
  box(floatingSource, mats.woodLight, [0, 0, 0], [0.7, 0.08, 0.7]);
  lantern(floatingSource, 0, 0.3, 0, 0.6);
  const floatingLantern = bake(floatingSource);
  floatingLantern.name = 'shared-floating-lantern';
  floatingLantern.visible = false;
  floatingLantern.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = false;
  });
  living.add(floatingLantern);
  let lastTime = 0,
    bellStart = -Infinity,
    lanternStart = -Infinity;
  function animateInteractions(time: number) {
    const bellAge = Math.max(0, time - bellStart),
      lanternAge = Math.max(0, time - lanternStart);
    bell.rotation.z = bellAge < 8 ? Math.sin(bellAge * 7) * 0.14 * Math.exp(-bellAge * 0.55) : 0;
    bell.userData.active = bellAge < 8;
    floatingLantern.visible = lanternAge < 60;
    if (floatingLantern.visible) {
      floatingLantern.position.set(
        10.2 + (lanternAge / 60) * 3.8,
        0.15 + Math.sin(lanternAge * 1.2) * 0.015,
        12.6 + Math.sin((lanternAge / 60) * 1.5) * 0.9,
      );
      floatingLantern.rotation.y = Math.sin(lanternAge * 0.24) * 0.15;
      floatingLantern.scale.setScalar(Math.min(1, Math.max(0, (60 - lanternAge) / 3)));
    }
  }
  beam(source, mats.woodDark, v(-17.5, 3.1, 6), v(-14.5, 3.1, 6), 0.14);
  // Side pagoda shrine gives the garden a second destination.
  for (let i = 0; i < 3; i++)
    box(source, mats.stone, [16, 0.15 + i * 0.18, -6], [6.4 - i * 0.7, 0.3, 6.4 - i * 0.7]);
  for (const x of [13.9, 18.1])
    for (const z of [-8.1, -3.9]) {
      cyl(source, mats.wood, [x, 2.3, z], [0.19, 3.5, 0.19]);
      box(source, mats.woodEnd, [x, 3.9, z], [0.7, 0.16, 0.7]);
    }
  box(source, mats.plaster, [16, 2.2, -8.1], [4.4, 3.2, 0.17]);
  box(source, mats.woodDark, [16, 1.1, -6.8], [2.2, 0.9, 1.6]);
  ellipsoid(source, mats.gold, [16, 2, -6.8], [0.52, 0.75, 0.38]);
  ellipsoid(source, mats.gold, [16, 2.85, -6.8], [0.35, 0.4, 0.33]);
  roof(source, 16, -6, 6.5, 6.5, 4, 1.6);
  roof(source, 16, -6, 4.7, 4.7, 5.65, 1.2);
  cyl(source, mats.goldDark, [16, 7.3, -6], [0.09, 1, 0.09]);
  ellipsoid(source, mats.gold, [16, 7.9, -6], [0.19, 0.3, 0.19]);
  for (const x of [13.8, 18.2]) lantern(source, x, 3, -4, 0.9);
  // Stone lanterns lead from the entrance to the hall.
  const light = material('#e4d499');
  light.emissive.set('#d9b969');
  light.emissiveIntensity = 0.22;
  for (const x of [-6.9, 6.9])
    for (const z of [12.4, 20, 26]) {
      box(source, mats.stoneDark, [x, 0.1, z], [0.9, 0.2, 0.9]);
      cyl(source, mats.stone, [x, 0.6, z], [0.2, 1, 0.2]);
      box(source, mats.stone, [x, 1.15, z], [0.68, 0.2, 0.68]);
      box(source, light, [x, 1.47, z], [0.44, 0.48, 0.44]);
      for (const dx of [-0.27, 0.27])
        for (const dz of [-0.27, 0.27])
          box(source, mats.stoneDark, [x + dx, 1.45, z + dz], [0.08, 0.53, 0.08]);
      taper(source, mats.stone, [x, 1.89, z], [0.72, 0.44, 0.72]);
      ellipsoid(source, mats.stone, [x, 2.16, z], [0.12, 0.14, 0.12]);
    }
  // Perimeter conifers are instanced by component. Their staggered tiers keep a varied silhouette.
  const treePositions: { x: number; z: number; s: number }[] = [];
  for (let i = 0; i < 100; i++) {
    const a = (i / 100) * Math.PI * 2,
      r = 33 + rand() * 16;
    const x = Math.cos(a) * r,
      z = Math.sin(a) * r - 6,
      s = 1 + rand() * 1.3;
    // Keep the fair's south-east follow-camera sight line free of large pine crowns.
    if (!(x > -30 && x < -6 && z > 22 && z < 44)) treePositions.push({ x, z, s });
  }
  for (let i = 0; i < 20; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const x = side * (26 + rand() * 5),
      z = -21 + rand() * 46;
    if (!explorationClearing(x, z) && !(x > -30 && x < -6 && z > 22 && z < 44))
      treePositions.push({ x, z, s: 0.8 + rand() * 0.9 });
  }
  const trunks = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.14, 0.24, 1, 7),
    mats.woodDark,
    treePositions.length,
  );
  const crowns = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7), pine, treePositions.length * 4);
  const dummy = new THREE.Object3D();
  treePositions.forEach((t, i) => {
    dummy.position.set(t.x, t.s * 2.2, t.z);
    dummy.scale.set(t.s, t.s * 4.4, t.s);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    for (let k = 0; k < 4; k++) {
      dummy.position.set(t.x, t.s * (2.8 + k * 0.95), t.z);
      dummy.scale.set(t.s * (1.9 - k * 0.3), t.s * 2.6, t.s * (1.9 - k * 0.3));
      dummy.rotation.y = i * 0.7 + k * 0.3;
      dummy.updateMatrix();
      crowns.setMatrixAt(i * 4 + k, dummy.matrix);
      crowns.setColorAt(i * 4 + k, new THREE.Color(k % 2 === 0 ? '#526f58' : '#668166'));
    }
  });
  trunks.castShadow = true;
  crowns.castShadow = true;
  crowns.receiveShadow = true;
  trunks.name = 'forest-trunks';
  crowns.name = 'forest-near-crowns';
  const farCrowns = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 5), pine, treePositions.length * 2);
  farCrowns.name = 'forest-distant-crowns';
  farCrowns.castShadow = false;
  farCrowns.receiveShadow = true;
  farCrowns.count = 0;
  farCrowns.visible = false;
  trunks.computeBoundingSphere();
  crowns.computeBoundingSphere();
  living.add(trunks, crowns, farCrowns);
  // Two sculptural courtyard trees, each matching a shared collision footprint.
  const treeLeaves = new THREE.Group();
  for (const tree of [
    { x: -12, z: 17, s: 1.1, flower: true },
    { x: 10, z: 22, s: 1.3, flower: false },
  ]) {
    const { x, z, s } = tree;
    beam(source, mats.woodDark, v(x, 0.1, z), v(x - 0.25 * s, 3.8 * s, z + 0.2), 0.28 * s);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * 6.28,
        r = (1.1 + rand()) * s,
        yy = (3.2 + rand() * 1.4) * s,
        xx = x + Math.cos(a) * r,
        zz = z + Math.sin(a) * r;
      beam(source, mats.woodDark, v(x - 0.2, 2.7 * s, z), v(xx, yy, zz), 0.09 * s);
      for (let k = 0; k < 3; k++)
        shape(
          treeLeaves,
          new THREE.IcosahedronGeometry(1, 1),
          tree.flower ? blossom : i % 2 ? leaf : leafLight,
          [xx + (rand() - 0.5) * s, yy + 0.3 * s, zz + (rand() - 0.5) * s],
          [s * (1 + rand() * 0.45), s * (0.55 + rand() * 0.4), s * (1 + rand() * 0.4)],
        );
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * 6.28;
      shape(
        source,
        new THREE.DodecahedronGeometry(1),
        pebble,
        [x + Math.cos(a) * 1.15, 0.12, z + Math.sin(a) * 1.15],
        [0.3, 0.22, 0.25],
        [rand(), a, 0],
      );
    }
  }
  living.add(bake(treeLeaves));
  // Tall bamboo in the rear garden uses slender visible stalks and pointed leaves.
  for (let i = 0; i < 34; i++) {
    const x = -24 + rand() * 48,
      z = -19 - rand() * 4,
      h = 4 + rand() * 4;
    if (explorationClearing(x, z)) continue;
    cyl(source, leaf, [x, h / 2, z], [0.055, h, 0.055]);
    for (let j = 1; j < h; j += 0.7) {
      cyl(source, leafLight, [x, j, z], [0.065, 0.04, 0.065]);
      if (j > 2)
        for (const sign of [-1, 1])
          ellipsoid(
            source,
            pine,
            [x + sign * 0.35, j + 0.15, z],
            [0.45, 0.06, 0.12],
            [0, rand() * 2, sign * 0.3],
          );
    }
  }
  // Layered faceted hills beyond the walkable garden disappear naturally into scene fog.
  for (let layer = 0; layer < 3; layer++) {
    const mountainMat = material(['#7e9988', '#93a99b', '#a8b6a5'][layer]);
    for (let i = 0; i < 15; i++) {
      const a = (i / 15) * Math.PI * 2,
        r = 55 + layer * 20 + rand() * 9,
        height = 10 + rand() * 16 + layer * 4;
      const g = new THREE.ConeGeometry(1, 1, 7, 2);
      const pos = g.attributes.position;
      for (let k = 0; k < pos.count; k++) {
        const y = pos.getY(k);
        if (y < 0.49) {
          pos.setX(k, pos.getX(k) * (1 + (rand() - 0.5) * 0.4));
          pos.setZ(k, pos.getZ(k) * (1 + (rand() - 0.5) * 0.4));
        }
      }
      g.computeVertexNormals();
      shape(
        source,
        g,
        mountainMat,
        [Math.cos(a) * r, height * 0.37 - 2, Math.sin(a) * r - 14],
        [15 + rand() * 14, height, 13 + rand() * 14],
        [0, rand() * 6, 0],
      );
    }
  }
  // A single instanced draw call covers small waving clumps of grass.
  const grassMat = material('#798e68');
  grassMat.side = THREE.DoubleSide;
  const grassGeo = new THREE.BufferGeometry();
  grassGeo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [-0.04, 0, 0, 0.04, 0, 0, 0.005, 0.4, 0, 0, 0, -0.04, 0, 0, 0.04, 0, 0.3, 0.025],
      3,
    ),
  );
  grassGeo.computeVertexNormals();
  const locations: number[][] = [];
  for (let i = 0; i < 1900; i++) {
    const x = (rand() - 0.5) * 66,
      z = (rand() - 0.5) * 66;
    if (
      (Math.abs(x) < 11.5 && z < 12 && z > -15) ||
      (Math.abs(x) < 5 && z > 10) ||
      (x > 9 && x < 20 && z > 8 && z < 18) ||
      (Math.abs(x + 16) < 4 && Math.abs(z - 4) < 6) ||
      (Math.abs(x - 16) < 4 && Math.abs(z + 6) < 4) ||
      explorationClearing(x, z)
    )
      continue;
    locations.push([x, z, 0.6 + rand() * 1.2]);
  }
  const grass = new THREE.InstancedMesh(grassGeo, grassMat, locations.length);
  grass.name = 'garden-grass';
  locations.forEach((p, i) => {
    dummy.position.set(p[0], 0, p[1]);
    dummy.scale.setScalar(p[2]);
    dummy.rotation.set(0, rand() * 6.28, 0);
    dummy.updateMatrix();
    grass.setMatrixAt(i, dummy.matrix);
  });
  grass.computeBoundingSphere();
  living.add(grass);
  const wind = { value: 0 };
  grassMat.onBeforeCompile = (shader) => {
    shader.uniforms.uWind = wind;
    shader.vertexShader = 'uniform float uWind;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\ntransformed.x += sin(uWind * 1.2 + instanceMatrix[3].x * .7 + instanceMatrix[3].z * .3) * position.y * .32;',
    );
  };
  const leafWind = { value: 0 };
  for (const mat of [leaf, leafLight, blossom])
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uWind = leafWind;
      shader.vertexShader = 'uniform float uWind;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\ntransformed.x += sin(uWind*.6 + position.z*.65) * .035 * max(0.0, position.y-2.0);',
      );
    };
  const detail = bake(source);
  detail.add(...zones.static);
  living.add(zones.moving);
  detail.traverse((o) => {
    if (o instanceof THREE.Mesh && o.material === water) o.castShadow = false;
  });
  const waterTime = { value: 0 };
  water.onBeforeCompile = (shader) => {
    shader.uniforms.uWaterTime = waterTime;
    shader.fragmentShader = 'uniform float uWaterTime;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      '#include <normal_fragment_begin>\nnormal = normalize(normal + vec3(sin(vViewPosition.x * 5.0 + uWaterTime * .6) * .024, cos(vViewPosition.y * 4.0 + uWaterTime * .4) * .018, 0.0));',
    );
  };
  let quality: 'low' | 'medium' | 'high' = 'high',
    lastLodUpdate = -1;
  function updateTreeLod(player: { x: number; z: number }) {
    let near = 0,
      far = 0;
    const distance = quality === 'low' ? 22 : quality === 'medium' ? 34 : 46;
    treePositions.forEach((t, index) => {
      const close = Math.hypot(t.x - player.x, t.z - player.z) < distance;
      const mesh = close ? crowns : farCrowns,
        tiers = close ? 4 : 2;
      for (let k = 0; k < tiers; k++) {
        dummy.position.set(t.x, t.s * (close ? 2.8 + k * 0.95 : 3.15 + k * 1.65), t.z);
        const width = t.s * (close ? 1.9 - k * 0.3 : 1.85 - k * 0.55);
        dummy.scale.set(width, t.s * (close ? 2.6 : 3.3), width);
        dummy.rotation.set(0, index * 0.7 + k * 0.3, 0);
        dummy.updateMatrix();
        const at = close ? near++ : far++;
        mesh.setMatrixAt(at, dummy.matrix);
        mesh.setColorAt(at, new THREE.Color(k % 2 === 0 ? '#526f58' : '#668166'));
      }
    });
    for (const [mesh, count] of [
      [crowns, near],
      [farCrowns, far],
    ] as const) {
      mesh.count = count;
      mesh.visible = count > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }
  return {
    ground,
    detail,
    living,
    triggerInteraction(kind: WorldInteractionKind, elapsed: number) {
      const age = Number.isFinite(elapsed) ? Math.max(0, elapsed) : Infinity;
      if (kind === 'bell') bellStart = lastTime - age;
      else if (kind === 'lantern') lanternStart = lastTime - age;
      animateInteractions(lastTime);
    },
    resetInteractions() {
      bellStart = lanternStart = -Infinity;
      animateInteractions(lastTime);
    },
    setQuality(next: 'low' | 'medium' | 'high') {
      quality = next;
      grass.count = Math.floor(
        locations.length * (quality === 'low' ? 0.24 : quality === 'medium' ? 0.58 : 1),
      );
      crowns.castShadow = trunks.castShadow = quality === 'high';
      zones.setQuality(quality);
      lastLodUpdate = -1;
    },
    update(time: number, player: { x: number; z: number }) {
      lastTime = time;
      animateInteractions(time);
      wind.value = time;
      leafWind.value = time;
      waterTime.value = time;
      zones.update(time, player);
      if (lastLodUpdate < 0 || time - lastLodUpdate > 0.5) {
        updateTreeLod(player);
        lastLodUpdate = time;
      }
      water.color.setHSL(0.45, 0.18, 0.57 + Math.sin(time * 0.35) * 0.015);
      ripples.forEach((r, i) => {
        const phase = (time * 0.14 + i * 0.33) % 1,
          s = 0.2 + phase * 2;
        r.scale.set(s, s, 1);
        (r.material as THREE.MeshBasicMaterial).opacity = Math.sin(phase * Math.PI) * 0.2;
      });
    },
  };
}
