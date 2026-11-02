import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Action, AvatarStyle } from '../../shared/world';

type Limb = { upper: THREE.Group; lower: THREE.Group; hand?: THREE.Group; ankle?: THREE.Group };
const ease = (value: number) => {
  const x = THREE.MathUtils.clamp(value, 0, 1);
  return x * x * (3 - 2 * x);
};
const mix = THREE.MathUtils.lerp;
const DOWN = new THREE.Vector3(0, -1, 0);
const ARM = 0.26,
  FOREARM = 0.205;

/** Original round-headed novice monk, with the later animation rig and distance LOD. */
export function createCharacter(name: string, color: string, avatar: AvatarStyle = 'dck') {
  const group = new THREE.Group();
  group.name = `avatar-${avatar}-${name}`;
  group.userData.avatar = avatar;
  const details: THREE.Object3D[] = [];
  const allocatedGeometries = new Set<THREE.BufferGeometry>();
  const allocatedMaterials = new Set<THREE.Material>();
  let near = true,
    labelVisible = true;
  const robeColor = new THREE.Color(color);
  const skin = new THREE.MeshStandardMaterial({ color: '#f2c39c', roughness: 0.88 });
  const blushMaterial = new THREE.MeshStandardMaterial({ color: '#dc927f', roughness: 1 });
  const robe = new THREE.MeshStandardMaterial({ color: robeColor, roughness: 0.97 });
  const robeShadow = new THREE.MeshStandardMaterial({
    color: robeColor.clone().multiplyScalar(0.71),
    roughness: 1,
  });
  const robeLight = new THREE.MeshStandardMaterial({
    color: robeColor.clone().lerp(new THREE.Color('#ffe5aa'), 0.27),
    roughness: 1,
  });
  const eyeMaterial = new THREE.MeshStandardMaterial({ color: '#312c2a', roughness: 1 });
  const sandalMaterial = new THREE.MeshStandardMaterial({ color: '#72503a', roughness: 1 });
  const pelvis = new THREE.Group();
  pelvis.name = 'pelvis';
  pelvis.position.y = 0.53;
  group.add(pelvis);
  const torso = new THREE.Group();
  torso.name = 'torso';
  pelvis.add(torso);
  function mesh(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    parent: THREE.Object3D,
    x = 0,
    y = 0,
    z = 0,
    detail = false,
  ) {
    const object = new THREE.Mesh(geometry, material);
    allocatedGeometries.add(geometry);
    allocatedMaterials.add(material);
    object.position.set(x, y, z);
    object.castShadow = !detail;
    object.receiveShadow = true;
    parent.add(object);
    if (detail) details.push(object);
    return object;
  }
  const sphereGeometry = new THREE.SphereGeometry(1, 20, 14);
  const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 12);
  function sphere(
    parent: THREE.Object3D,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    detail = false,
  ) {
    const object = mesh(sphereGeometry, material, parent, x, y, z, detail);
    object.scale.set(sx, sy, sz);
    return object;
  }
  function cylinder(
    parent: THREE.Object3D,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
    radius: number,
    height: number,
    detail = false,
  ) {
    const object = mesh(cylinderGeometry, material, parent, x, y, z, detail);
    object.scale.set(radius, height, radius);
    return object;
  }
  sphere(torso, robe, 0, 0.4, 0, 0.31, 0.31 * 0.95, 0.31 * 0.78);
  const skirt = mesh(new THREE.CylinderGeometry(0.265, 0.405, 0.68, 28), robe, torso, 0, 0.08, 0);
  const overlap = mesh(new THREE.BoxGeometry(0.16, 0.56, 0.035), robeLight, torso, 0.05, 0.4, 0.245);
  overlap.rotation.z = -0.37;
  const belt = mesh(new THREE.CylinderGeometry(0.294, 0.307, 0.065, 32), robeShadow, torso, 0, 0.255, 0);
  belt.scale.z = 0.91;
  sphere(torso, robeShadow, -0.16, 0.25, 0.29, 0.05, 0.0375, 0.02, true);
  const sashEnd = mesh(new THREE.BoxGeometry(0.065, 0.24, 0.025), robeShadow, torso, -0.16, 0.11, 0.31, true);
  sashEnd.rotation.z = -0.1;
  const skirtFolds = new THREE.Group();
  skirtFolds.position.copy(skirt.position);
  torso.add(skirtFolds);
  for (let i = -2; i <= 2; i++) {
    const x = i * 0.105;
    const fold = mesh(
      new THREE.CylinderGeometry(0.007, 0.013, 0.4, 7),
      i % 2 ? robeLight : robeShadow,
      skirtFolds,
      x,
      -0.095,
      Math.sqrt(Math.max(0, 0.365 ** 2 - x ** 2)) * 0.94,
      true,
    );
    fold.rotation.z = -i * 0.055;
  }
  sphere(torso, skin, 0, 0.665, 0, 0.115, 0.1265, 0.115);
  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(0, 0.975, 0);
  torso.add(head);
  // The first version used one large, round bald head, not an adult jaw/chin.
  sphere(head, skin, 0, 0, 0, 0.355 * 1.045, 0.355 * 1.06, 0.355);
  for (const sign of [-1, 1]) {
    sphere(head, skin, sign * 0.359, -0.012, -0.006, 0.074 * 0.62, 0.074, 0.074 * 0.72);
    sphere(head, blushMaterial, sign * 0.377, -0.012, 0.035, 0.037 * 0.4, 0.037 * 0.8, 0.037 * 0.3, true);
    sphere(head, blushMaterial, sign * 0.195, -0.058, 0.296, 0.047, 0.047 * 0.42, 0.047 * 0.17, true);
  }
  const eyes = [-1, 1].map((sign) => {
    const eye = new THREE.Group();
    eye.position.set(sign * 0.128, 0.018, 0.332);
    head.add(eye);
    details.push(eye);
    sphere(eye, eyeMaterial, 0, 0, 0, 0.026 * 0.76, 0.026 * 1.2, 0.026 * 0.5);
    const brow = mesh(
      new THREE.TorusGeometry(0.039, 0.005, 6, 14, Math.PI * 0.75),
      robeShadow,
      head,
      sign * 0.13,
      0.088,
      0.325,
      true,
    );
    brow.rotation.z = Math.PI * 0.12;
    return eye;
  });
  sphere(head, skin, 0, -0.038, 0.356, 0.028 * 0.7, 0.028 * 0.7, 0.028 * 0.8, true);
  const smile = mesh(
    new THREE.TorusGeometry(0.045, 0.007, 7, 20, Math.PI),
    eyeMaterial,
    head,
    0,
    -0.074,
    0.348,
    true,
  );
  smile.rotation.z = Math.PI;
  function arm(sign: number): Limb {
    const upper = new THREE.Group();
    upper.name = sign < 0 ? 'left-shoulder' : 'right-shoulder';
    upper.position.set(sign * 0.3, 0.53, 0);
    torso.add(upper);
    const sleeve = mesh(new THREE.CylinderGeometry(0.125, 0.14, 0.29, 16), robe, upper, sign * 0.012, -0.115, 0);
    sleeve.rotation.z = sign * 0.08;
    const lower = new THREE.Group();
    lower.name = sign < 0 ? 'left-elbow' : 'right-elbow';
    lower.position.y = -ARM;
    upper.add(lower);
    mesh(
      new THREE.CylinderGeometry(0.095, 0.085, 0.19, 14),
      robeLight,
      lower,
      0,
      -0.075,
      0,
    );
    const hand = new THREE.Group();
    hand.name = sign < 0 ? 'left-hand' : 'right-hand';
    hand.position.y = -FOREARM;
    lower.add(hand);
    details.push(hand);
    sphere(hand, skin, 0, 0, 0.005, 0.085 * 0.78, 0.085 * 1.05, 0.085 * 0.54);
    return { upper, lower, hand };
  }
  function leg(sign: number): Limb {
    const upper = new THREE.Group();
    upper.name = sign < 0 ? 'left-hip' : 'right-hip';
    upper.position.set(sign * 0.15, -0.02, 0);
    pelvis.add(upper);
    mesh(new THREE.CylinderGeometry(0.115, 0.1, 0.235, 14), robeShadow, upper, 0, -0.115, 0);
    const lower = new THREE.Group();
    lower.name = sign < 0 ? 'left-knee' : 'right-knee';
    lower.position.y = -0.23;
    upper.add(lower);
    mesh(new THREE.CylinderGeometry(0.095, 0.08, 0.19, 14), robe, lower, 0, -0.08, 0);
    const ankle = new THREE.Group();
    ankle.name = sign < 0 ? 'left-ankle' : 'right-ankle';
    // Keep the original short shin and sandal shape, with the later grounded sole offset.
    ankle.position.y = -0.215;
    lower.add(ankle);
    sphere(ankle, skin, 0, 0, 0.05, 0.1 * 0.87, 0.1 * 0.53, 0.1 * 1.32);
    sphere(ankle, sandalMaterial, 0, -0.035, 0.053, 0.11 * 0.89, 0.11 * 0.28, 0.11 * 1.35);
    const strap = mesh(new THREE.BoxGeometry(0.17, 0.025, 0.035), robeShadow, ankle, 0, 0.03, 0.078, true);
    strap.rotation.x = 0.05;
    return { upper, lower, ankle };
  }
  const arms = [arm(-1), arm(1)],
    legs = [leg(-1), leg(1)];
  // Bake static pieces on each bone into one vertex-colored mesh per LOD layer.
  // Facial geometry and cloth retain their colors while avoiding a draw per detail.
  const originalDetails = new Set(details);
  details.length = 0;
  const batchedMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97 });
  function batchBone(parent: THREE.Object3D) {
    for (const child of [...parent.children]) if (child instanceof THREE.Group) batchBone(child);
    if (originalDetails.has(parent)) details.push(parent);
    for (const detail of [false, true]) {
      const pieces = parent.children.filter(
        (object): object is THREE.Mesh =>
          object instanceof THREE.Mesh && object !== skirt && originalDetails.has(object) === detail,
      );
      if (pieces.length < 2) {
        if (detail && pieces[0]) details.push(pieces[0]);
        continue;
      }
      const baked = pieces.map((object) => {
        object.updateMatrix();
        const geometry = object.geometry.clone().applyMatrix4(object.matrix);
        const material = object.material as THREE.MeshStandardMaterial;
        const colors = new Float32Array(geometry.getAttribute('position').count * 3);
        for (let i = 0; i < colors.length; i += 3) {
          colors[i] = material.color.r;
          colors[i + 1] = material.color.g;
          colors[i + 2] = material.color.b;
        }
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        return geometry;
      });
      const geometry = mergeGeometries(baked, false);
      if (geometry) {
        pieces.forEach((piece) => parent.remove(piece));
        const combined = mesh(geometry, batchedMaterial, parent, 0, 0, 0, detail);
        combined.name = `${parent.name || 'cloth'}-${detail ? 'detail' : 'body'}`;
      }
      baked.forEach((geometry) => geometry.dispose());
    }
  }
  batchBone(group);
  const nameCanvas = document.createElement('canvas');
  nameCanvas.width = 512;
  nameCanvas.height = 96;
  const nameTexture = new THREE.CanvasTexture(nameCanvas);
  nameTexture.colorSpace = THREE.SRGBColorSpace;
  const nameMaterial = new THREE.SpriteMaterial({
    map: nameTexture,
    transparent: true,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const nameplate = new THREE.Sprite(nameMaterial);
  nameplate.name = 'nameplate';
  nameplate.position.set(0, 2.13, 0);
  nameplate.scale.set(1.8, 0.3375, 1);
  group.add(nameplate);
  function setName(value: string) {
    const context = nameCanvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, 512, 96);
    context.font = '500 30px "Segoe UI", Arial, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const shown = [...value].slice(0, 22).join('');
    const width = Math.min(490, context.measureText(shown).width + 40);
    context.fillStyle = 'rgba(39, 38, 30, .60)';
    context.beginPath();
    context.roundRect((512 - width) / 2, 20, width, 54, 24);
    context.fill();
    context.fillStyle = '#fff9e9';
    context.fillText(shown, 256, 48, width - 28);
    nameTexture.needsUpdate = true;
  }
  setName(name);
  function setDetail(value: boolean) {
    if (near !== value)
      details.forEach((object) => {
        object.visible = value;
      });
    near = value;
    nameplate.visible = near && labelVisible;
  }
  function setLabelVisible(value: boolean) {
    labelVisible = value;
    nameplate.visible = near && labelVisible;
  }

  const direction = new THREE.Vector3(),
    bend = new THREE.Vector3(),
    elbow = new THREE.Vector3();
  const upperDirection = new THREE.Vector3(),
    lowerDirection = new THREE.Vector3();
  const desiredUpper = new THREE.Quaternion(),
    desiredLower = new THREE.Quaternion(),
    desiredHand = new THREE.Quaternion();
  const inverseUpper = new THREE.Quaternion(),
    inverseLower = new THREE.Quaternion();
  /** Two-bone IK in torso coordinates gives joined palms an exact, shared target. */
  function poseArm(
    limb: Limb,
    wrist: THREE.Vector3,
    hint: THREE.Vector3,
    handRotation: THREE.Quaternion,
    alpha: number,
  ) {
    direction.subVectors(wrist, limb.upper.position);
    const distance = THREE.MathUtils.clamp(direction.length(), 0.015, ARM + FOREARM - 0.002);
    direction.normalize();
    bend.subVectors(hint, limb.upper.position);
    bend.addScaledVector(direction, -bend.dot(direction)).normalize();
    const along = (ARM * ARM - FOREARM * FOREARM + distance * distance) / (2 * distance);
    elbow
      .copy(limb.upper.position)
      .addScaledVector(direction, along)
      .addScaledVector(bend, Math.sqrt(Math.max(0, ARM * ARM - along * along)));
    upperDirection.subVectors(elbow, limb.upper.position).normalize();
    lowerDirection.copy(limb.upper.position).addScaledVector(direction, distance).sub(elbow).normalize();
    desiredUpper.setFromUnitVectors(DOWN, upperDirection);
    inverseUpper.copy(desiredUpper).invert();
    desiredLower.setFromUnitVectors(DOWN, lowerDirection).premultiply(inverseUpper);
    inverseLower.copy(desiredUpper).multiply(desiredLower).invert();
    desiredHand.copy(handRotation).premultiply(inverseLower);
    limb.upper.quaternion.slerp(desiredUpper, alpha);
    limb.lower.quaternion.slerp(desiredLower, alpha);
    limb.hand!.quaternion.slerp(desiredHand, alpha);
  }
  const wrist = new THREE.Vector3(),
    elbowHint = new THREE.Vector3(),
    prayerWrist = new THREE.Vector3(),
    floorWrist = new THREE.Vector3();
  const handOrientation = new THREE.Quaternion(),
    floorHand = new THREE.Quaternion();
  const poseEuler = new THREE.Euler();
  let lastAction: Action = 'idle';
  function update(dt: number, time: number, action: Action, actionElapsed: number) {
    const alpha = 1 - Math.exp(-Math.min(Math.max(dt, 0), 0.1) * 16);
    const running = action === 'run',
      moving = action === 'walk' || running;
    const phase = time * (running ? 11.5 : 8.5),
      stride = moving ? Math.sin(phase) : 0;
    const breathe = Math.sin(time * 1.7) * (action === 'sit' ? 0.0035 : 0.006);
    let height = 0.53 + breathe + (moving ? Math.abs(Math.sin(phase)) * (running ? 0.045 : 0.018) : 0);
    let torsoPitch = running ? 0.13 : moving ? 0.025 : 0,
      headPitch = running ? -0.08 : 0;
    let skirtY = 1,
      skirtXZ = 1;
    let legX = [-stride * (running ? 0.8 : 0.46), stride * (running ? 0.8 : 0.46)];
    let legZ = [0, 0];
    let kneeX = [Math.max(0, stride) * (running ? 1.1 : 0.52), Math.max(0, -stride) * (running ? 1.1 : 0.52)];
    let kneeZ = [0, 0],
      kneeling = 0,
      prayer = 0,
      prostrate = 0,
      closedEyes = false;
    if (action === 'sit') {
      // Engine places the root 0.15 m above the floor, on the cushion.
      height = 0.23 + breathe;
      torsoPitch = -0.01;
      headPitch = 0.05;
      skirtY = 0.66;
      skirtXZ = 1.23;
      legX = [-0.93, -0.93];
      legZ = [-1.11, 1.11];
      kneeX = [1.33, 1.33];
      kneeZ = [2.08, -2.08];
      closedEyes = true;
    } else if (action === 'greet' || action === 'pray') {
      prayer = 1;
      headPitch = 0.1;
      if (action === 'pray') {
        height = 0.34 + breathe;
        kneeling = 1;
        skirtY = 0.7;
        skirtXZ = 1.12;
        legX = [-0.7, -0.7];
        kneeX = [2.02, 2.02];
        closedEyes = true;
      }
    } else if (action === 'bow') {
      const t = THREE.MathUtils.clamp(actionElapsed, 0, 4.2);
      const kneel = ease((t - 0.65) / 0.8) * (1 - ease((t - 3.4) / 0.8));
      prostrate = ease((t - 1.45) / 0.85) * (1 - ease((t - 2.85) / 0.65));
      prayer =
        ease(t / 0.35) * (1 - ease((t - 1.25) / 0.45)) +
        ease((t - 3.45) / 0.35) * (1 - ease((t - 3.95) / 0.25));
      height = mix(0.53, mix(0.34, 0.265, prostrate), kneel);
      kneeling = kneel;
      torsoPitch = mix(0.06 * prayer, 1.46, prostrate);
      headPitch = 0.1;
      skirtY = mix(1, 0.7, kneel);
      skirtXZ = mix(1, 1.12, kneel);
      legX = [-kneel * mix(0.7, 1.2, prostrate), -kneel * mix(0.7, 1.2, prostrate)];
      kneeX = [kneel * mix(2.02, 2.38, prostrate), kneel * mix(2.02, 2.38, prostrate)];
      closedEyes = true;
    }
    pelvis.position.y = mix(pelvis.position.y, height, alpha);
    torso.rotation.x = mix(torso.rotation.x, torsoPitch, alpha);
    torso.rotation.z = mix(torso.rotation.z, moving ? stride * 0.019 : Math.sin(time * 0.8) * 0.005, alpha);
    head.rotation.x = mix(head.rotation.x, headPitch, alpha);
    skirt.scale.set(
      mix(skirt.scale.x, skirtXZ, alpha),
      mix(skirt.scale.y, skirtY, alpha),
      mix(skirt.scale.z, skirtXZ, alpha),
    );
    skirtFolds.scale.copy(skirt.scale);
    for (let i = 0; i < 2; i++) {
      const sign = i === 0 ? -1 : 1,
        swing = stride * sign;
      wrist.set(
        sign * 0.35,
        0.065 + (running ? 0.15 : 0),
        moving ? swing * (running ? 0.23 : 0.14) : 0.018,
      );
      elbowHint.set(sign * 0.36, 0.24, -0.07);
      handOrientation.setFromEuler(poseEuler.set(0, 0, sign * -0.05));
      if (action === 'sit') {
        wrist.set(sign * 0.095, 0.20, 0.245);
        elbowHint.set(sign * 0.35, 0.16, 0.11);
        handOrientation.setFromEuler(poseEuler.set(-Math.PI / 2, 0, sign * 0.9));
      } else if (prayer > 0 || prostrate > 0) {
        prayerWrist.set(sign * 0.046, 0.37, 0.325);
        floorWrist.set(sign * 0.2, 0.8, 0.3);
        prayerWrist.lerp(floorWrist, prostrate);
        wrist.lerp(prayerWrist, Math.max(prayer, prostrate));
        elbowHint.set(sign * 0.39, 0.13, 0.17);
        handOrientation.setFromEuler(poseEuler.set(0, (sign * Math.PI) / 2, Math.PI));
        if (prostrate > 0) {
          floorHand.setFromEuler(poseEuler.set(-Math.PI / 2 - torsoPitch, 0, 0));
          handOrientation.slerp(floorHand, prostrate);
        }
      } else if (action === 'wave' && i === 1) {
        wrist.set(0.46 + Math.sin(time * 6.5) * 0.047, 0.79, 0.085);
        elbowHint.set(0.48, 0.42, 0.02);
        handOrientation.setFromEuler(poseEuler.set(0, 0, Math.PI + Math.sin(time * 6.5) * 0.18));
      }
      poseArm(arms[i], wrist, elbowHint, handOrientation, alpha);
      legs[i].upper.rotation.x = mix(legs[i].upper.rotation.x, legX[i], alpha);
      legs[i].upper.rotation.z = mix(legs[i].upper.rotation.z, legZ[i], alpha);
      legs[i].lower.rotation.x = mix(legs[i].lower.rotation.x, kneeX[i], alpha);
      legs[i].lower.rotation.z = mix(legs[i].lower.rotation.z, kneeZ[i], alpha);
      legs[i].ankle!.rotation.x = mix(legs[i].ankle!.rotation.x, -1.29 * kneeling, alpha);
      if (near) {
        const blink = Math.sin(time * 1.73 + 1.4) > 0.994;
        eyes[i].scale.y = mix(eyes[i].scale.y, closedEyes || blink ? 0.15 : 1, alpha);
      }
    }
    nameplate.position.y = mix(
      nameplate.position.y,
      action === 'sit' ? 1.8 : action === 'pray' ? 1.9 : action === 'bow' ? 1.9 : 2.13,
      alpha,
    );
    if (lastAction !== action) group.userData.action = action;
    lastAction = action;
  }
  function dispose() {
    const geometries = allocatedGeometries,
      materials = allocatedMaterials;
    group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        geometries.add(object.geometry);
        const list = Array.isArray(object.material) ? object.material : [object.material];
        list.forEach((material) => materials.add(material));
      }
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    nameTexture.dispose();
    nameMaterial.dispose();
    group.removeFromParent();
  }
  return { group, update, setName, setDetail, setLabelVisible, dispose };
}
