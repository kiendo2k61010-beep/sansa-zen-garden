import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const palette = {
  wood: '#89633e',
  woodLight: '#ad8554',
  woodDark: '#4e4734',
  woodEnd: '#c6a271',
  roof: '#42665d',
  roofLight: '#547a6b',
  roofDark: '#304e48',
  stone: '#b6baa7',
  stoneDark: '#858f80',
  gold: '#d8b866',
  goldDark: '#b5954d',
  plaster: '#dad9b5',
};
export function material(color: string, roughness = 0.84, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}
type Surface = 'wood' | 'stone' | 'cloth';
const surfaceTextures = new Map<Surface, THREE.DataTexture>();
/** Tiny deterministic, original micro-surface maps also work in headless Node tests. */
export function surfaceMaterial(color: string, surface: Surface) {
  let texture = surfaceTextures.get(surface);
  if (!texture) {
    const size = 64,
      data = new Uint8Array(size * size * 4);
    let seed = 173;
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        const noise = seed / 4294967296;
        const grain =
          surface === 'wood'
            ? Math.sin(x * 1.2 + Math.sin(y * 0.16) * 1.7) * 0.5 + 0.5
            : surface === 'cloth'
              ? x % 4 < 2 === y % 4 < 2
                ? 0.3
                : 0.8
              : noise;
        const value = Math.round(190 + grain * 43 + noise * 18),
          at = (y * size + x) * 4;
        data[at] = data[at + 1] = data[at + 2] = value;
        data[at + 3] = 255;
      }
    texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    texture.name = `original-${surface}-micro-surface`;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.repeat.set(surface === 'wood' ? 3 : 5, surface === 'wood' ? 1 : 5);
    texture.needsUpdate = true;
    surfaceTextures.set(surface, texture);
  }
  return new THREE.MeshStandardMaterial({
    color,
    roughness: surface === 'stone' ? 0.95 : 0.88,
    roughnessMap: texture,
    bumpMap: texture,
    bumpScale: surface === 'cloth' ? 0.012 : surface === 'wood' ? 0.026 : 0.045,
  });
}
export const mats = {
  wood: surfaceMaterial(palette.wood, 'wood'),
  woodLight: surfaceMaterial(palette.woodLight, 'wood'),
  woodDark: surfaceMaterial(palette.woodDark, 'wood'),
  woodEnd: surfaceMaterial(palette.woodEnd, 'wood'),
  roof: material(palette.roof),
  roofLight: material(palette.roofLight),
  roofDark: material(palette.roofDark),
  stone: surfaceMaterial(palette.stone, 'stone'),
  stoneDark: surfaceMaterial(palette.stoneDark, 'stone'),
  gold: material(palette.gold, 0.55, 0.28),
  goldDark: material(palette.goldDark, 0.65, 0.2),
  plaster: material(palette.plaster),
};
const lanternGlow = new THREE.MeshStandardMaterial({
  color: '#efd795',
  emissive: '#f5b857',
  emissiveIntensity: 0.18,
  roughness: 0.7,
});

const cube = new THREE.BoxGeometry(1, 1, 1);
const sphere = new THREE.SphereGeometry(1, 16, 12);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 12);
const cone = new THREE.ConeGeometry(1, 1, 10);
export function shape(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  mat: THREE.Material,
  pos: number[],
  scale: number[] = [1, 1, 1],
  rot: number[] = [0, 0, 0],
) {
  const m = new THREE.Mesh(geometry, mat);
  m.position.set(pos[0], pos[1], pos[2]);
  m.scale.set(scale[0], scale[1], scale[2]);
  m.rotation.set(rot[0], rot[1], rot[2]);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
export function box(p: THREE.Object3D, m: THREE.Material, pos: number[], s: number[], r?: number[]) {
  return shape(p, cube, m, pos, s, r);
}
export function ellipsoid(p: THREE.Object3D, m: THREE.Material, pos: number[], s: number[], r?: number[]) {
  return shape(p, sphere, m, pos, s, r);
}
export function cyl(p: THREE.Object3D, m: THREE.Material, pos: number[], s: number[], r?: number[]) {
  return shape(p, cylinder, m, pos, s, r);
}
export function taper(p: THREE.Object3D, m: THREE.Material, pos: number[], s: number[], r?: number[]) {
  return shape(p, cone, m, pos, s, r);
}
export function tube(
  p: THREE.Object3D,
  m: THREE.Material,
  points: THREE.Vector3[],
  radius: number,
  segments = 28,
) {
  const geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), segments, radius, 6, false);
  return shape(p, geometry, m, [0, 0, 0]);
}
export function beam(
  p: THREE.Object3D,
  m: THREE.Material,
  a: THREE.Vector3,
  b: THREE.Vector3,
  width: number,
) {
  const d = b.clone().sub(a);
  const mesh = cyl(p, m, a.clone().add(b).multiplyScalar(0.5).toArray(), [width, d.length(), width]);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return mesh;
}

/** Bake decorative geometry into one draw call per material. Picking uses separate surfaces. */
export function bake(source: THREE.Group) {
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  source.updateMatrixWorld(true);
  source.traverse((o) => {
    if (o instanceof THREE.Mesh && !Array.isArray(o.material)) {
      let geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
      if (geo.index) {
        const indexed = geo;
        geo = indexed.toNonIndexed();
        indexed.dispose();
      }
      // Keep primitive UVs for subtle material grain; custom roofs need a planar fallback.
      if (!geo.attributes.uv) {
        const position = geo.attributes.position,
          uv = new Float32Array(position.count * 2);
        for (let i = 0; i < position.count; i++) {
          uv[i * 2] = position.getX(i) * 0.25;
          uv[i * 2 + 1] = (position.getZ(i) + position.getY(i)) * 0.25;
        }
        geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      }
      const items = buckets.get(o.material) || [];
      items.push(geo);
      buckets.set(o.material, items);
    }
  });
  const result = new THREE.Group();
  buckets.forEach((geos, mat) => {
    const merged = mergeGeometries(geos, false);
    if (merged) {
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      result.add(mesh);
    }
    geos.forEach((g) => g.dispose());
  });
  // Most source primitives are shared; generated tubes and roofs are no longer needed after baking.
  const generated = new Set<THREE.BufferGeometry>();
  source.traverse((o) => {
    if (o instanceof THREE.Mesh && ![cube, sphere, cylinder, cone].includes(o.geometry))
      generated.add(o.geometry);
  });
  generated.forEach((g) => g.dispose());
  return result;
}

function roofY(v: number, u: number, rise: number) {
  return (
    rise * Math.pow(1 - Math.abs(v), 1.7) + 0.65 * Math.pow(Math.abs(v), 7) + 0.6 * Math.pow(Math.abs(u), 8)
  );
}
export function roof(
  parent: THREE.Group,
  cx: number,
  cz: number,
  width: number,
  depth: number,
  base: number,
  rise: number,
) {
  const positions: number[] = [];
  const nx = 28,
    nz = 28;
  function point(ix: number, iz: number) {
    const u = (ix / nx) * 2 - 1,
      v = (iz / nz) * 2 - 1;
    return [cx + (u * width) / 2, base + roofY(v, u, rise), cz + (v * depth) / 2];
  }
  for (let x = 0; x < nx; x++)
    for (let z = 0; z < nz; z++) {
      const a = point(x, z),
        b = point(x + 1, z),
        c = point(x + 1, z + 1),
        d = point(x, z + 1);
      positions.push(...a, ...d, ...b, ...b, ...d, ...c);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  shape(parent, g, mats.roof, [0, 0, 0]);
  // Closely spaced curved ribs and horizontal courses read as traditional clay tile work.
  for (let x = 0; x <= Math.floor(width / 0.48); x++) {
    const u = (x / Math.floor(width / 0.48)) * 2 - 1;
    for (const sign of [-1, 1]) {
      const points = Array.from({ length: 13 }, (_, i) => {
        const v = (i / 12) * sign;
        return new THREE.Vector3(
          cx + (u * width) / 2,
          base + roofY(v, u, rise) + 0.035,
          cz + (v * depth) / 2,
        );
      });
      tube(parent, x % 3 === 0 ? mats.roofLight : mats.roofDark, points, 0.043, 18);
    }
  }
  for (let j = 1; j < 12; j++)
    for (const sign of [-1, 1]) {
      const v = (j / 12) * sign;
      const points = Array.from({ length: 17 }, (_, i) => {
        const u = i / 8 - 1;
        return new THREE.Vector3(
          cx + (u * width) / 2,
          base + roofY(v, u, rise) + 0.045,
          cz + (v * depth) / 2,
        );
      });
      tube(parent, mats.roofDark, points, 0.023, 20);
    }
  for (const sign of [-1, 1]) {
    const points = Array.from({ length: 23 }, (_, i) => {
      const u = i / 11 - 1;
      return new THREE.Vector3(cx + (u * width) / 2, base + roofY(sign, u, rise), cz + (sign * depth) / 2);
    });
    tube(parent, mats.woodDark, points, 0.14, 32);
    tube(
      parent,
      mats.goldDark,
      points.map((p) => p.clone().add(new THREE.Vector3(0, 0.12, 0))),
      0.045,
      32,
    );
  }
  const ridge = Array.from({ length: 23 }, (_, i) => {
    const u = i / 11 - 1;
    return new THREE.Vector3(cx + u * width * 0.49, base + rise + 0.12 + 0.64 * Math.pow(Math.abs(u), 8), cz);
  });
  tube(parent, mats.roofDark, ridge, 0.19, 28);
  tube(
    parent,
    mats.goldDark,
    ridge.map((p) => p.clone().add(new THREE.Vector3(0, 0.16, 0))),
    0.055,
    28,
  );
  for (const sign of [-1, 1]) {
    const x = cx + sign * width * 0.49,
      y = base + rise + 0.65;
    tube(
      parent,
      mats.goldDark,
      [
        new THREE.Vector3(x - sign * 0.4, y, cz),
        new THREE.Vector3(x + sign * 0.2, y + 0.3, cz),
        new THREE.Vector3(x + sign * 0.35, y + 0.85, cz),
        new THREE.Vector3(x + sign * 0.1, y + 1.15, cz),
      ],
      0.095,
      12,
    );
  }
}

export function lantern(p: THREE.Object3D, x: number, y: number, z: number, scale = 1) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.scale.setScalar(scale);
  p.add(group);
  cyl(group, mats.woodDark, [0, 0.54, 0], [0.025, 0.5, 0.025]);
  shape(group, new THREE.CylinderGeometry(0.27, 0.23, 0.53, 8), lanternGlow, [0, 0, 0]);
  for (const py of [-0.28, 0.28]) cyl(group, mats.woodDark, [0, py, 0], [0.29, 0.07, 0.29]);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    cyl(group, mats.woodLight, [Math.cos(a) * 0.25, 0, Math.sin(a) * 0.25], [0.016, 0.52, 0.016]);
  }
  cyl(group, mats.goldDark, [0, -0.42, 0], [0.025, 0.2, 0.025]);
  return group;
}

export function lotus(p: THREE.Object3D, x: number, y: number, z: number, size: number, mat: THREE.Material) {
  for (let row = 0; row < 2; row++)
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 + row * 0.3,
        r = size * (row === 0 ? 0.43 : 0.25);
      const petal = ellipsoid(
        p,
        mat,
        [x + Math.cos(a) * r, y + row * size * 0.13, z + Math.sin(a) * r],
        [size * 0.19, size * 0.13, size * 0.43],
      );
      petal.rotation.set(row * 0.48, Math.PI / 2 - a, 0);
    }
  ellipsoid(p, mats.gold, [x, y + size * 0.13, z], [size * 0.19, size * 0.12, size * 0.19]);
}

function buddha(parent: THREE.Group) {
  const p = new THREE.Group();
  p.position.set(0, 1.5, -10.25);
  parent.add(p);
  // Lotus throne, layered robe, crossed legs, meditating hands and a gently smiling face.
  cyl(p, mats.goldDark, [0, 0.25, 0], [2.22, 0.5, 1.6]);
  cyl(p, mats.gold, [0, 0.55, 0], [2.08, 0.14, 1.5]);
  for (let i = 0; i < 20; i++) {
    const a = (i * Math.PI) / 10;
    const petal = ellipsoid(p, mats.gold, [Math.cos(a) * 1.85, 0.56, Math.sin(a) * 1.3], [0.28, 0.45, 0.15]);
    petal.rotation.z = -Math.cos(a) * 0.4;
  }
  ellipsoid(p, mats.gold, [0, 0.85, 0], [1.87, 0.49, 1.08]);
  ellipsoid(p, mats.gold, [0, 2.06, -0.12], [1.1, 1.39, 0.66]);
  ellipsoid(p, mats.goldDark, [-0.38, 2.02, -0.05], [0.8, 1.28, 0.65], [0, 0, -0.18]);
  // Broad shoulders and rounded upper arms establish a human silhouette.
  for (const s of [-1, 1]) {
    ellipsoid(p, mats.gold, [s * 0.97, 2.02, 0], [0.33, 0.85, 0.36], [0, 0, s * 0.32]);
    ellipsoid(p, mats.gold, [s * 0.67, 1.33, 0.55], [0.69, 0.24, 0.29], [0, 0, -s * 0.15]);
    ellipsoid(p, mats.gold, [s * 0.25, 1.2, 0.8], [0.39, 0.14, 0.3], [0, 0, s * 0.08]);
    ellipsoid(p, mats.gold, [s * 0.74, 0.89, 0.7], [1.05, 0.36, 0.52], [0, s * 0.33, s * 0.12]);
    ellipsoid(p, mats.goldDark, [s * 0.37, 0.81, 1.02], [0.6, 0.18, 0.3], [0, s * 0.4, 0]);
  }
  cyl(p, mats.gold, [0, 3.32, -0.1], [0.34, 0.5, 0.34]);
  ellipsoid(p, mats.gold, [0, 3.94, -0.12], [0.69, 0.86, 0.64]);
  for (const s of [-1, 1]) ellipsoid(p, mats.gold, [s * 0.68, 3.81, -0.08], [0.15, 0.43, 0.18]);
  ellipsoid(p, mats.goldDark, [0, 4.45, -0.17], [0.68, 0.4, 0.62]);
  ellipsoid(p, mats.goldDark, [0, 4.88, -0.2], [0.28, 0.34, 0.29]);
  ellipsoid(p, mats.gold, [0, 3.91, 0.51], [0.11, 0.2, 0.15]);
  for (const s of [-1, 1]) {
    tube(
      p,
      mats.goldDark,
      [
        new THREE.Vector3(s * 0.13, 4.02, 0.495),
        new THREE.Vector3(s * 0.29, 3.99, 0.49),
        new THREE.Vector3(s * 0.43, 4.03, 0.42),
      ],
      0.022,
      8,
    );
    tube(
      p,
      mats.goldDark,
      [
        new THREE.Vector3(s * 0.13, 4.2, 0.48),
        new THREE.Vector3(s * 0.3, 4.26, 0.47),
        new THREE.Vector3(s * 0.45, 4.23, 0.4),
      ],
      0.027,
      8,
    );
  }
  tube(
    p,
    mats.goldDark,
    [
      new THREE.Vector3(-0.19, 3.64, 0.46),
      new THREE.Vector3(0, 3.61, 0.52),
      new THREE.Vector3(0.19, 3.64, 0.46),
    ],
    0.019,
    8,
  );
  ellipsoid(p, mats.goldDark, [0, 4.2, 0.53], [0.052, 0.052, 0.025]);
  for (let j = 0; j < 4; j++)
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2,
        r = 0.65 * Math.sin(((j + 1) / 5) * Math.PI * 0.5),
        yy = 4.38 + 0.42 * Math.cos(((j + 1) / 5) * Math.PI * 0.5);
      ellipsoid(p, mats.goldDark, [Math.sin(a) * r, yy, Math.cos(a) * r - 0.17], [0.075, 0.075, 0.075]);
    }
  // Fine robe folds rather than flat blocks.
  for (let i = 0; i < 6; i++) {
    const yy = 1.4 + i * 0.24;
    tube(
      p,
      mats.goldDark,
      [
        new THREE.Vector3(-0.77, yy, 0.35),
        new THREE.Vector3(-0.25, yy - 0.2, 0.6),
        new THREE.Vector3(0.55, yy - 0.33, 0.54),
      ],
      0.024,
      12,
    );
  }
  const halo = new THREE.TorusGeometry(2.32, 0.075, 8, 64);
  shape(p, halo, mats.gold, [0, 3.1, -0.96]);
  shape(p, new THREE.TorusGeometry(2.54, 0.025, 6, 64), mats.goldDark, [0, 3.1, -0.97]);
  for (let i = 0; i < 40; i++) {
    const a = (i * Math.PI) / 20;
    const v = new THREE.Vector3(Math.cos(a), Math.sin(a), 0);
    beam(
      p,
      mats.goldDark,
      new THREE.Vector3(v.x * 2.59, 3.1 + v.y * 2.59, -0.97),
      new THREE.Vector3(v.x * 2.72, 3.1 + v.y * 2.72, -0.97),
      0.022,
    );
  }
}

export function createArchitecture() {
  const detail = new THREE.Group(),
    roofs = new THREE.Group();
  box(detail, mats.stoneDark, [0, 0.18, -2.4], [21.6, 0.36, 23.4]);
  box(detail, mats.stone, [0, 0.43, -2.4], [21, 0.25, 23]);
  box(detail, mats.woodDark, [0, 0.535, -2.4], [20.7, 0.07, 22.8]);
  // Individually staggered floor planks and a border around the hall.
  for (let z = -13.45; z < 8.9; z += 0.54)
    for (let x = -10; x <= 10; x += 4) {
      const stagger = Math.round((z + 13.45) / 0.54) % 2 ? 1.9 : 0;
      const start = Math.max(-10, x - 2 + stagger),
        end = Math.min(10, x + 2 + stagger);
      if (end > start)
        box(
          detail,
          (Math.round(z * 8) + Math.round(x)) % 3 === 0 ? mats.woodLight : mats.wood,
          [(start + end) / 2, 0.57, z],
          [end - start - 0.025, 0.06, 0.515],
        );
    }
  for (const x of [-10.2, 10.2]) box(detail, mats.woodEnd, [x, 0.58, -2.4], [0.2, 0.04, 22.6]);
  for (let i = 0; i < 3; i++) {
    const h = 0.45 - i * 0.15;
    box(detail, mats.stone, [0, h / 2, 9.5 + i], [12, h, 1]);
  }
  // Open facade and side bays expose the meditation room to its garden.
  for (const x of [-9.5, 9.5])
    for (const z of [-11, -4, 3, 8.5]) {
      cyl(detail, mats.stoneDark, [x, 0.8, z], [0.57, 0.4, 0.57]);
      cyl(detail, mats.stone, [x, 1.02, z], [0.48, 0.16, 0.48]);
      cyl(detail, mats.wood, [x, 3.65, z], [0.34, 5.2, 0.34]);
      for (const y of [1.17, 5.7, 6.15]) cyl(detail, mats.woodDark, [x, y, z], [0.4, 0.13, 0.4]);
      for (const y of [5.75, 6.05]) {
        box(detail, mats.woodLight, [x, y, z], [1.3, 0.19, 0.63]);
        box(detail, mats.woodEnd, [x, y + 0.12, z], [0.67, 0.15, 1.35]);
      }
      for (const s of [-1, 1]) {
        box(detail, mats.woodLight, [x + s * 0.46, 5.51, z], [0.75, 0.2, 0.28], [0, 0, s * 0.48]);
        box(detail, mats.woodLight, [x, 5.51, z + s * 0.46], [0.28, 0.2, 0.75], [-s * 0.48, 0, 0]);
      }
    }
  for (const x of [-9.5, 9.5]) {
    box(roofs, mats.woodDark, [x, 6.3, -1.2], [0.45, 0.5, 22]);
    box(roofs, mats.woodLight, [x, 5.8, -1.2], [0.22, 0.24, 22]);
  }
  for (const z of [-11, -4, 3, 8.5]) {
    box(roofs, mats.woodDark, [0, 6.3, z], [19.8, 0.48, 0.42]);
    box(roofs, mats.woodLight, [0, 5.95, z], [19.5, 0.18, 0.24]);
    for (let x = -8; x <= 8; x += 2) box(roofs, mats.woodEnd, [x, 6.05, z], [0.13, 0.5, 0.2]);
  }
  // Rear plaster wall, timber grid and slatted screens frame the statue.
  box(detail, mats.plaster, [0, 3, -13.5], [20.2, 4.8, 0.25]);
  for (let x = -9.5; x <= 9.5; x += 1.9) box(detail, mats.wood, [x, 3.2, -13.3], [0.12, 4.9, 0.2]);
  for (const y of [1, 2, 4.8, 5.6]) box(detail, mats.woodLight, [0, y, -13.25], [20, 0.1, 0.2]);
  for (const x of [-9.5, 9.5])
    for (const z of [-8, -0.5, 5.7]) {
      box(detail, mats.woodDark, [x, 1.8, z], [0.18, 0.13, 3.8]);
      for (let j = -3; j <= 3; j++) box(detail, mats.woodLight, [x, 1.3, z + j * 0.5], [0.09, 0.9, 0.09]);
    }
  // Paired columns at the back, leaving all twelve cushions visually unobstructed.
  for (const x of [-4.3, 4.3]) {
    cyl(detail, mats.wood, [x, 3.5, -12.1], [0.23, 5.7, 0.23]);
    lantern(detail, x, 4.75, -11, 1.3);
  }
  box(roofs, mats.woodDark, [0, 5.4, 8.5], [4.1, 0.9, 0.18]);
  box(roofs, mats.goldDark, [0, 5.4, 8.61], [3.85, 0.68, 0.03]);
  box(roofs, mats.woodDark, [0, 5.4, 8.64], [3.7, 0.56, 0.03]);
  // Decorative lotus on the entrance name plaque; interface carries the accessible temple name.
  lotus(roofs, 0, 5.4, 8.78, 0.42, mats.gold);
  for (const x of [-7, -3.5, 3.5, 7]) lantern(roofs, x, 5.2, 8.4, 0.85);
  box(detail, mats.woodDark, [0, 0.95, -10.25], [6.6, 0.65, 3.6]);
  box(detail, mats.woodEnd, [0, 1.3, -10.25], [6.9, 0.12, 3.8]);
  buddha(detail);
  const flowerMaterial = material('#d4a3a0');
  for (const x of [-2.55, 2.55]) {
    cyl(detail, mats.goldDark, [x, 1.63, -8.8], [0.22, 0.55, 0.22]);
    ellipsoid(detail, mats.goldDark, [x, 1.54, -8.8], [0.32, 0.32, 0.32]);
    for (let i = 0; i < 3; i++) {
      const xx = x + (i - 1) * 0.28;
      cyl(detail, mats.woodDark, [xx, 2, -8.8], [0.018, 0.7, 0.018]);
      lotus(detail, xx, 2.38 + Math.sin(i) * 0.12, -8.8, 0.38, flowerMaterial);
    }
  }
  for (const x of [-1.5, 1.5]) {
    cyl(detail, mats.goldDark, [x, 1.55, -8.65], [0.13, 0.4, 0.13]);
    cyl(detail, mats.plaster, [x, 1.92, -8.65], [0.09, 0.4, 0.09]);
    ellipsoid(detail, mats.gold, [x, 2.18, -8.65], [0.045, 0.13, 0.045]);
  }
  ellipsoid(detail, mats.goldDark, [0, 1.6, -8.6], [0.42, 0.24, 0.3]);
  cyl(detail, mats.gold, [0, 1.74, -8.6], [0.42, 0.08, 0.3]);
  for (const x of [-0.12, 0, 0.12]) cyl(detail, mats.woodDark, [x, 2, -8.6], [0.012, 0.5, 0.012]);
  roof(roofs, 0, -2.2, 24.5, 25.2, 6.45, 3.7);
  roof(roofs, 0, -2.2, 19.5, 12.5, 8.65, 3);
  return { structure: bake(detail), roof: bake(roofs) };
}
