import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCharacter } from '../src/scene/character';
import type { Action, AvatarStyle } from '../shared/world';

function withAvatar(run: (avatar: ReturnType<typeof createCharacter>) => void, style: AvatarStyle = 'dck') {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    value: { createElement: () => ({ width: 0, height: 0, getContext: () => null }) },
    configurable: true,
  });
  const avatar = createCharacter('DCK', '#b88755', style);
  try {
    run(avatar);
  } finally {
    avatar.dispose();
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  }
}

function settle(avatar: ReturnType<typeof createCharacter>, action: Action, elapsed = 0) {
  for (let frame = 0; frame < 90; frame++) avatar.update(1 / 60, 1, action, elapsed);
  avatar.group.updateMatrixWorld(true);
}

test('DCK preserves the original round chibi head, short legs and grounded feet', () => {
  withAvatar((avatar) => {
    assert.equal(avatar.group.userData.avatar, 'dck');
    settle(avatar, 'idle');
    const bounds = new THREE.Box3();
    avatar.group.traverse((object) => {
      if (object instanceof THREE.Mesh) bounds.union(new THREE.Box3().setFromObject(object));
    });
    assert.ok(bounds.max.y > 1.8 && bounds.max.y < 2, `Height ${bounds.max.y}`);
    assert.ok(bounds.min.y >= 0 && bounds.min.y < 0.04, `Feet height ${bounds.min.y}`);
    const head = new THREE.Box3().setFromObject(avatar.group.getObjectByName('head')!);
    const headHeight = head.max.y - head.min.y;
    assert.ok(headHeight > 0.74 && headHeight < 0.78, `Original head height ${headHeight}`);
    assert.ok(bounds.max.y / headHeight < 2.6, 'Original silhouette is about 2.5 heads tall');
    assert.ok(Math.abs(avatar.group.getObjectByName('head')!.position.y - 0.975) < 0.001);
    assert.ok(Math.abs(avatar.group.getObjectByName('left-knee')!.position.y + 0.23) < 0.001);
  });
});

test('greeting and kneeling prayer align both palms in front of the chest', () => {
  withAvatar((avatar) => {
    for (const action of ['greet', 'pray'] as Action[]) {
      settle(avatar, action);
      const left = avatar.group.getObjectByName('left-hand')!;
      const right = avatar.group.getObjectByName('right-hand')!;
      const a = left.getWorldPosition(new THREE.Vector3());
      const b = right.getWorldPosition(new THREE.Vector3());
      // Original palms have radius .085 * .54, so their centers are .092 apart when touching.
      assert.ok(Math.abs(a.distanceTo(b) - 0.092) < 0.001, `${action}: wrist gap ${a.distanceTo(b)}`);
      assert.ok(Math.abs(a.y - b.y) < 0.001 && Math.abs(a.z - b.z) < 0.001);
      const tipsA = left.localToWorld(new THREE.Vector3(0, -0.1, 0));
      const tipsB = right.localToWorld(new THREE.Vector3(0, -0.1, 0));
      assert.ok(tipsA.y > a.y && tipsB.y > b.y, 'Prayer fingers point upward');
    }
  });
});

test('every animation stays finite, bow returns to standing, and wave raises one hand', () => {
  withAvatar((avatar) => {
    for (const action of ['idle', 'walk', 'run', 'sit', 'greet', 'bow', 'pray', 'wave'] as Action[]) {
      for (let frame = 0; frame < 300; frame++) {
        avatar.update(1 / 60, frame / 60, action, frame / 60);
        avatar.group.updateMatrixWorld(true);
        avatar.group.traverse((object) => assert.ok(object.matrixWorld.elements.every(Number.isFinite)));
      }
    }
    settle(avatar, 'bow', 4.2);
    assert.ok(Math.abs(avatar.group.getObjectByName('pelvis')!.position.y - 0.53) < 0.001);
    settle(avatar, 'wave');
    const left = avatar.group.getObjectByName('left-hand')!.getWorldPosition(new THREE.Vector3());
    const right = avatar.group.getObjectByName('right-hand')!.getWorldPosition(new THREE.Vector3());
    assert.ok(right.y - left.y > 0.6);
  });
});

test('meditation, prayer and completed bow poses keep knees and feet above the floor', () => {
  withAvatar((avatar) => {
    for (const action of ['sit', 'pray', 'bow'] as Action[]) {
      avatar.group.position.y = action === 'sit' ? 0.15 : 0;
      settle(avatar, action, 2.5);
      for (const name of ['left-hip', 'right-hip']) {
        const bounds = new THREE.Box3().setFromObject(avatar.group.getObjectByName(name)!);
        assert.ok(bounds.min.y >= 0, `${action} ${name} crosses the floor: ${bounds.min.y}`);
      }
    }
  });
});

test('walking and running soles remain above the floor throughout each stride', () => {
  withAvatar((avatar) => {
    const point = new THREE.Vector3();
    for (const action of ['walk', 'run'] as Action[]) {
      for (let sample = 0; sample < 32; sample++) {
        const time = ((sample / 32) * Math.PI * 2) / (action === 'run' ? 11.5 : 8.5);
        for (let frame = 0; frame < 12; frame++) avatar.update(0.1, time, action, time);
        avatar.group.updateMatrixWorld(true);
        let minimum = Infinity;
        for (const name of ['left-ankle', 'right-ankle']) {
          avatar.group.getObjectByName(name)!.traverse((object) => {
            if (!(object instanceof THREE.Mesh)) return;
            const vertices = object.geometry.getAttribute('position');
            for (let index = 0; index < vertices.count; index++) {
              point.fromBufferAttribute(vertices, index).applyMatrix4(object.matrixWorld);
              minimum = Math.min(minimum, point.y);
            }
          });
        }
        assert.ok(minimum >= -0.01, `${action} stride ${sample}: sole ${minimum}`);
      }
    }
  });
});

test('distance detail hides facial ornaments and labels without removing the humanoid', () => {
  for (const style of ['dck', 'lotus', 'sage'] as AvatarStyle[])
    withAvatar((avatar) => {
      const count = () => {
        let visible = 0;
        avatar.group.traverseVisible((object) => {
          if (object instanceof THREE.Mesh) visible++;
        });
        return visible;
      };
      const full = count();
      assert.ok(full <= 32, `Static bone meshes should be batched: ${full} meshes`);
      avatar.setDetail(false);
      assert.ok(count() < full * 0.65, `LOD keeps ${count()} of ${full} meshes`);
      for (const bone of ['head', 'left-shoulder', 'right-shoulder', 'left-hip', 'right-hip']) {
        const part = avatar.group.getObjectByName(bone)!;
        assert.ok(
          part.visible && part.children.some((child) => child instanceof THREE.Mesh && child.visible),
        );
      }
      assert.equal(avatar.group.getObjectByName('nameplate')!.visible, false);
      avatar.setLabelVisible(false);
      avatar.setDetail(true);
      assert.equal(count(), full);
      assert.equal(avatar.group.getObjectByName('nameplate')!.visible, false);
      avatar.setLabelVisible(true);
      assert.equal(avatar.group.getObjectByName('nameplate')!.visible, true);
    }, style);
});
