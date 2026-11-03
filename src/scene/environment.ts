import * as THREE from 'three';
import { SEATS, type WorldInteractionKind } from '../../shared/world';
import { bake, box, createArchitecture, cyl, material, shape, surfaceMaterial } from './architecture';
import { createGardens } from './nature';

export interface Environment {
  group: THREE.Group;
  pickables: THREE.Object3D[];
  update: (time: number, dt: number, player: { x: number; z: number }, camera?: THREE.Vector3) => void;
  setOccupied: (seats: Record<string, string>) => void;
  setQuality: (quality: 'low' | 'medium' | 'high') => void;
  triggerInteraction: (kind: WorldInteractionKind, elapsed: number) => void;
  resetInteractions: () => void;
  dispose: () => void;
}

export function createEnvironment(): Environment {
  const group = new THREE.Group();
  group.name = 'An Nhiên · temple and gardens';
  const pickables: THREE.Object3D[] = [];
  const architecture = createArchitecture(),
    gardens = createGardens();
  architecture.structure.name = 'main-hall';
  architecture.roof.name = 'main-hall-roof';
  gardens.detail.name = 'garden-architecture';
  gardens.living.name = 'living-garden';
  group.add(gardens.ground, gardens.detail, gardens.living, architecture.structure, architecture.roof);
  gardens.ground.traverse((o) => {
    if (o instanceof THREE.Mesh && o.userData.ground) pickables.push(o);
  });
  // Dedicated horizontal picking surfaces do not depend on merged visual architecture.
  const invisible = new THREE.MeshBasicMaterial({ visible: false });
  const floor = shape(
    group,
    new THREE.PlaneGeometry(20.8, 22.8),
    invisible,
    [0, 0.602, -2.4],
    [1, 1, 1],
    [-Math.PI / 2, 0, 0],
  );
  floor.name = 'hall-navigation-surface';
  floor.userData.ground = true;
  pickables.push(floor);
  for (let i = 0; i < 3; i++) {
    const step = shape(
      group,
      new THREE.PlaneGeometry(12, 1),
      invisible,
      [0, 0.45 - i * 0.15, 9.5 + i],
      [1, 1, 1],
      [-Math.PI / 2, 0, 0],
    );
    step.name = `stair-navigation-${i}`;
    step.userData.ground = true;
    pickables.push(step);
  }
  const cushionMat = surfaceMaterial('#b89a6d', 'cloth'),
    occupiedMat = surfaceMaterial('#8d8066', 'cloth'),
    cushionEdge = material('#8f7652'),
    cushionSeam = material('#d2ba8f'),
    matMaterial = surfaceMaterial('#677664', 'cloth');
  const seats = new Map<string, { disc: THREE.Mesh; ring: THREE.Mesh }>();
  const trim = new THREE.Group();
  for (const seat of SEATS) {
    // Woven square mat, rounded cushion and concentric stitched seams.
    box(trim, matMaterial, [seat.x, 0.628, seat.z], [1.8, 0.055, 1.8]);
    for (const dx of [-0.82, 0.82])
      box(trim, cushionSeam, [seat.x + dx, 0.658, seat.z], [0.018, 0.012, 1.65]);
    for (const dz of [-0.82, 0.82])
      box(trim, cushionSeam, [seat.x, 0.658, seat.z + dz], [1.65, 0.012, 0.018]);
    const disc = shape(group, new THREE.CylinderGeometry(0.67, 0.72, 0.14, 32), cushionMat, [
      seat.x,
      0.74,
      seat.z,
    ]);
    disc.name = seat.id;
    disc.userData.seatId = seat.id;
    pickables.push(disc);
    cyl(trim, cushionEdge, [seat.x, 0.688, seat.z], [0.72, 0.038, 0.72]);
    for (const radius of [0.49, 0.6, 0.69])
      shape(
        trim,
        new THREE.TorusGeometry(radius, 0.012, 4, 32),
        cushionSeam,
        [seat.x, 0.812, seat.z],
        [1, 1, 1],
        [-Math.PI / 2, 0, 0],
      );
    const ring = shape(
      group,
      new THREE.RingGeometry(0.78, 0.81, 40),
      new THREE.MeshBasicMaterial({
        color: '#e0c985',
        transparent: true,
        opacity: 0.48,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
      [seat.x, 0.66, seat.z],
      [1, 1, 1],
      [-Math.PI / 2, 0, 0],
    );
    ring.name = `${seat.id}-availability`;
    ring.castShadow = false;
    seats.set(seat.id, { disc, ring });
  }
  group.add(bake(trim));
  // Floating motes stay sparse and soft; particles are rendered in one draw call.
  const count = 130,
    positions = new Float32Array(count * 3),
    origins = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = Math.sin(i * 57.13) * 21;
    positions[i * 3 + 1] = 0.8 + (Math.sin(i * 19.71) * 0.5 + 0.5) * 8;
    positions[i * 3 + 2] = Math.cos(i * 37.17) * 19;
  }
  origins.set(positions);
  const particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const particleMat = new THREE.PointsMaterial({
    color: '#f7eaca',
    size: 0.055,
    transparent: true,
    opacity: 0.47,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const particles = new THREE.Points(particleGeo, particleMat);
  particles.name = 'ambient-motes';
  particleGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 4, 0), 31);
  group.add(particles);
  // Translucent incense trails use original curves and fade out above the burner.
  const smokeCount = 35,
    smokePositions = new Float32Array(smokeCount * 3),
    smokeGeo = new THREE.BufferGeometry();
  smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokePositions, 3));
  const smoke = new THREE.Points(
    smokeGeo,
    new THREE.PointsMaterial({
      color: '#e8e4cc',
      size: 0.065,
      transparent: true,
      opacity: 0.23,
      depthWrite: false,
    }),
  );
  smoke.name = 'incense-smoke';
  smokeGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 3.6, -8.6), 2);
  group.add(smoke);
  const roofMaterials = new Set<THREE.Material>();
  architecture.roof.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      const original = o.material as THREE.Material;
      const copy = original.clone();
      o.material = copy;
      copy.transparent = true;
      roofMaterials.add(copy);
    }
  });
  const shadowCasters = new Set<THREE.Mesh>();
  group.traverse((o) => {
    if (o instanceof THREE.Mesh && o.castShadow) shadowCasters.add(o);
  });
  let roofOpacity = 1,
    particleCount = count,
    disposed = false;
  return {
    group,
    pickables,
    triggerInteraction(kind, elapsed) {
      gardens.triggerInteraction(kind, elapsed);
    },
    resetInteractions() {
      gardens.resetInteractions();
    },
    update(time, dt, player, camera) {
      gardens.update(time, player, camera);
      const target = Math.abs(player.x) < 10.8 && player.z < 9.4 && player.z > -14.5 ? 0 : 1;
      roofOpacity = THREE.MathUtils.damp(roofOpacity, target, 3.5, dt);
      architecture.roof.visible = roofOpacity > 0.025;
      roofMaterials.forEach((m) => {
        m.opacity = roofOpacity;
        m.depthWrite = roofOpacity > 0.9;
      });
      for (let i = 0; i < particleCount; i++) {
        positions[i * 3] = origins[i * 3] + Math.sin(time * 0.11 + i) * 0.8;
        positions[i * 3 + 1] = origins[i * 3 + 1] + Math.sin(time * 0.23 + i * 0.7) * 0.35;
        positions[i * 3 + 2] = origins[i * 3 + 2] + Math.cos(time * 0.09 + i) * 0.5;
      }
      particleGeo.attributes.position.needsUpdate = true;
      for (let i = 0; i < smokeCount; i++) {
        const phase = (i / smokeCount + time * 0.045) % 1;
        smokePositions[i * 3] = Math.sin(phase * 7 + time * 0.3) * phase * 0.25;
        smokePositions[i * 3 + 1] = 2.3 + phase * 2.7;
        smokePositions[i * 3 + 2] = -8.6 + Math.cos(phase * 8 + time * 0.2) * phase * 0.12;
      }
      smokeGeo.attributes.position.needsUpdate = true;
    },
    setOccupied(occupied) {
      seats.forEach(({ ring, disc }, id) => {
        ring.visible = !occupied[id];
        disc.userData.occupied = !!occupied[id];
        disc.material = occupied[id] ? occupiedMat : cushionMat;
      });
    },
    setQuality(quality) {
      particleCount = quality === 'low' ? 26 : quality === 'medium' ? 78 : count;
      particleGeo.setDrawRange(0, particleCount);
      smokeGeo.setDrawRange(0, quality === 'low' ? 12 : smokeCount);
      shadowCasters.forEach((mesh) => {
        mesh.castShadow = quality !== 'low';
      });
      gardens.setQuality(quality);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const geometries = new Set<THREE.BufferGeometry>(),
        materials = new Set<THREE.Material>(),
        textures = new Set<THREE.Texture>();
      group.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
          geometries.add(o.geometry);
          if (Array.isArray(o.material)) o.material.forEach((m) => materials.add(m));
          else materials.add(o.material);
        }
      });
      materials.add(occupiedMat);
      materials.add(cushionMat);
      materials.forEach((m) => {
        for (const value of Object.values(m)) if (value instanceof THREE.Texture) textures.add(value);
      });
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      group.clear();
    },
  };
}
