import * as THREE from 'three';
import { groundHeight, walkable } from '../../shared/world';

export interface Point {
  x: number;
  z: number;
}
const GRID = 0.6,
  MIN_X = -27,
  MIN_Z = -21,
  COLS = 91,
  ROWS = 83;
const keyOf = (x: number, z: number) => z * COLS + x;
const pointOf = (key: number): Point => ({
  x: MIN_X + (key % COLS) * GRID,
  z: MIN_Z + Math.floor(key / COLS) * GRID,
});

/** Checks the whole swept path, including its end points, against the shared world. */
export function clearPath(a: Point, b: Point): boolean {
  const count = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.12));
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    if (!walkable(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
  }
  return true;
}

function nearestNode(point: Point): number | null {
  const cx = Math.round((point.x - MIN_X) / GRID),
    cz = Math.round((point.z - MIN_Z) / GRID);
  let best: number | null = null,
    distance = Infinity;
  for (let dz = -2; dz <= 2; dz++)
    for (let dx = -2; dx <= 2; dx++) {
      const x = cx + dx,
        z = cz + dz;
      if (x < 0 || x >= COLS || z < 0 || z >= ROWS) continue;
      const key = keyOf(x, z),
        p = pointOf(key),
        d = Math.hypot(p.x - point.x, p.z - point.z);
      if (d < distance && clearPath(point, p)) {
        best = key;
        distance = d;
      }
    }
  return best;
}

class MinHeap {
  private data: { key: number; score: number }[] = [];
  get length() {
    return this.data.length;
  }
  push(key: number, score: number) {
    this.data.push({ key, score });
    let i = this.data.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.data[parent].score <= score) break;
      [this.data[parent], this.data[i]] = [this.data[i], this.data[parent]];
      i = parent;
    }
  }
  pop(): number {
    const first = this.data[0].key,
      last = this.data.pop()!;
    if (this.data.length) {
      this.data[0] = last;
      let i = 0;
      while (true) {
        const left = i * 2 + 1,
          right = left + 1;
        if (left >= this.data.length) break;
        const smallest =
          right < this.data.length && this.data[right].score < this.data[left].score ? right : left;
        if (this.data[i].score <= this.data[smallest].score) break;
        [this.data[i], this.data[smallest]] = [this.data[smallest], this.data[i]];
        i = smallest;
      }
    }
    return first;
  }
}

/** A* with diagonal corner checks, followed by collision-tested waypoint reduction. */
export function findPath(start: Point, end: Point): Point[] | null {
  if (!walkable(start.x, start.z) || !walkable(end.x, end.z)) return null;
  if (clearPath(start, end)) return [{ ...end }];
  const from = nearestNode(start),
    to = nearestNode(end);
  if (from === null || to === null) return null;
  const score = new Float64Array(COLS * ROWS).fill(Infinity);
  const parent = new Int32Array(COLS * ROWS).fill(-1);
  const closed = new Uint8Array(COLS * ROWS),
    available = new Int8Array(COLS * ROWS).fill(-1);
  const isOpen = (key: number) => {
    if (available[key] === -1) {
      const p = pointOf(key);
      available[key] = walkable(p.x, p.z) ? 1 : 0;
    }
    return available[key] === 1;
  };
  const target = pointOf(to),
    heap = new MinHeap();
  score[from] = 0;
  heap.push(from, 0);
  while (heap.length) {
    const current = heap.pop();
    if (closed[current]) continue;
    if (current === to) {
      const reversed: Point[] = [{ ...end }];
      let at = current;
      while (at !== from) {
        reversed.push(pointOf(at));
        at = parent[at];
      }
      reversed.push(pointOf(from));
      reversed.reverse();
      const result: Point[] = [];
      let anchor = start,
        i = 0;
      while (i < reversed.length) {
        let farthest = i;
        for (let j = i + 1; j < reversed.length; j++) {
          if (clearPath(anchor, reversed[j])) farthest = j;
        }
        result.push(reversed[farthest]);
        anchor = reversed[farthest];
        i = farthest + 1;
      }
      return result;
    }
    closed[current] = 1;
    const cx = current % COLS,
      cz = Math.floor(current / COLS),
      currentPoint = pointOf(current);
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = cx + dx,
          nz = cz + dz;
        if (nx < 0 || nx >= COLS || nz < 0 || nz >= ROWS) continue;
        const next = keyOf(nx, nz);
        if (closed[next] || !isOpen(next)) continue;
        if (dx && dz && (!isOpen(keyOf(cx + dx, cz)) || !isOpen(keyOf(cx, cz + dz)))) continue;
        const p = pointOf(next);
        if (!clearPath(currentPoint, p)) continue;
        const cost = score[current] + GRID * (dx && dz ? Math.SQRT2 : 1);
        if (cost >= score[next]) continue;
        score[next] = cost;
        parent[next] = current;
        heap.push(next, cost + Math.hypot(p.x - target.x, p.z - target.z));
      }
  }
  return null;
}

export class PlayerController {
  x = 0;
  z = 17;
  rotation = Math.PI;
  moving = false;
  running = false;
  private activeTarget: Point | null = null;
  private navigationGoal: Point | null = null;
  private active = true;
  private moveInput = { x: 0, y: 0, run: false };
  private waypoints: Point[] = [];
  private keys = new Set<string>();
  private yaw = 0.42;
  private polar = 1.02;
  private distance = 48;
  private focus = new THREE.Vector3(-4, 1.6, 0);
  private overview = true;
  private meditating = false;
  private savedDistance = 17;
  private pointers = new Map<number, { x: number; y: number }>();
  private pointerOrigin = { x: 0, y: 0 };
  private dragged = false;
  private pinchDistance = 0;
  private listeners: (() => void)[] = [];

  constructor(
    private camera: THREE.PerspectiveCamera,
    private canvas: HTMLCanvasElement,
    private onTap: (ndc: THREE.Vector2) => void,
  ) {
    camera.position.set(13, 27, 38);
    camera.lookAt(this.focus);
    canvas.style.touchAction = 'none';
    const listen = (
      target: EventTarget,
      event: string,
      handler: EventListener,
      options?: AddEventListenerOptions,
    ) => {
      target.addEventListener(event, handler, options);
      this.listeners.push(() => target.removeEventListener(event, handler, options));
    };
    const isTyping = (target: EventTarget | null) =>
      typeof HTMLElement !== 'undefined' &&
      target instanceof HTMLElement &&
      (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
    const movementKeys = new Set([
      'KeyW',
      'KeyA',
      'KeyS',
      'KeyD',
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'ShiftLeft',
      'ShiftRight',
    ]);
    listen(window, 'keydown', ((event: KeyboardEvent) => {
      if (isTyping(event.target)) {
        this.clearControls(false);
        return;
      }
      if (!movementKeys.has(event.code)) return;
      event.preventDefault();
      if (this.enabled) this.keys.add(event.code);
    }) as EventListener);
    listen(window, 'keyup', ((event: KeyboardEvent) => {
      this.keys.delete(event.code);
    }) as EventListener);
    listen(window, 'blur', (() => {
      this.clearControls(false);
      this.pointers.clear();
    }) as EventListener);
    // A held key must not keep moving the avatar after the chat gains focus.
    listen(window, 'focusin', ((event: FocusEvent) => {
      if (isTyping(event.target)) this.clearControls(false);
    }) as EventListener);
    listen(canvas, 'pointerdown', ((event: PointerEvent) => {
      if (event.button !== 0 && event.pointerType === 'mouse') return;
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      canvas.setPointerCapture(event.pointerId);
      if (this.pointers.size === 1) {
        this.pointerOrigin = { x: event.clientX, y: event.clientY };
        this.dragged = false;
      } else {
        this.dragged = true;
        this.pinchDistance = this.getPinchDistance();
      }
    }) as EventListener);
    listen(canvas, 'pointermove', ((event: PointerEvent) => {
      const last = this.pointers.get(event.pointerId);
      if (!last) return;
      const dx = event.clientX - last.x,
        dy = event.clientY - last.y;
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.pointers.size === 2) {
        const distance = this.getPinchDistance();
        this.distance = THREE.MathUtils.clamp(this.distance - (distance - this.pinchDistance) * 0.045, 7, 52);
        this.pinchDistance = distance;
        this.dragged = true;
      } else {
        if (Math.hypot(event.clientX - this.pointerOrigin.x, event.clientY - this.pointerOrigin.y) > 5)
          this.dragged = true;
        if (this.dragged) {
          this.yaw -= dx * 0.005;
          this.polar = THREE.MathUtils.clamp(this.polar + dy * 0.004, 0.45, 1.2);
        }
      }
    }) as EventListener);
    const release = (event: PointerEvent, cancelled = false) => {
      if (!this.pointers.has(event.pointerId)) return;
      this.pointers.delete(event.pointerId);
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      if (!cancelled && !this.dragged && this.pointers.size === 0 && this.enabled) {
        const rect = canvas.getBoundingClientRect();
        this.onTap(
          new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            (-(event.clientY - rect.top) / rect.height) * 2 + 1,
          ),
        );
      }
    };
    listen(canvas, 'pointerup', ((event: PointerEvent) => release(event)) as EventListener);
    listen(canvas, 'pointercancel', ((event: PointerEvent) => release(event, true)) as EventListener);
    listen(
      canvas,
      'wheel',
      ((event: WheelEvent) => {
        event.preventDefault();
        this.distance = THREE.MathUtils.clamp(this.distance + event.deltaY * 0.014, 7, 52);
      }) as EventListener,
      { passive: false },
    );
    listen(canvas, 'contextmenu', ((event: Event) => event.preventDefault()) as EventListener);
  }

  private getPinchDistance() {
    const points = [...this.pointers.values()];
    return points.length > 1 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0;
  }

  get enabled() {
    return this.active;
  }

  set enabled(value: boolean) {
    this.active = value;
    if (!value) this.clearControls();
  }

  get navigating() {
    return this.target !== null;
  }
  get target() {
    return this.activeTarget;
  }
  set target(value: Point | null) {
    this.activeTarget = value;
    this.navigationGoal = value;
  }

  /** Camera-relative analog input: positive x is right, positive y is forward. */
  setMoveInput(x: number, y: number, run = false) {
    if (!this.enabled) return;
    const safeX = Number.isFinite(x) ? x : 0;
    const safeY = Number.isFinite(y) ? y : 0;
    const length = Math.hypot(safeX, safeY);
    const scale = length > 1 ? 1 / length : 1;
    this.moveInput = length < 0.06 ? { x: 0, y: 0, run: false } : { x: safeX * scale, y: safeY * scale, run };
    if (this.moveInput.x || this.moveInput.y) {
      this.target = null;
      this.waypoints = [];
    }
  }

  clearControls(cancelNavigation = true) {
    this.keys.clear();
    this.moveInput = { x: 0, y: 0, run: false };
    this.moving = false;
    this.running = false;
    if (cancelNavigation) {
      this.target = null;
      this.waypoints = [];
    }
  }

  setTarget(x: number, z: number): boolean {
    if (!this.enabled) return false;
    const path = findPath({ x: this.x, z: this.z }, { x, z });
    if (!path) return false;
    this.target = { x, z };
    this.waypoints = path;
    this.moveInput = { x: 0, y: 0, run: false };
    this.overview = false;
    if (!this.meditating) this.distance = Math.min(this.distance, 20);
    return true;
  }

  teleport(x: number, z: number, rotation = this.rotation) {
    this.x = x;
    this.z = z;
    this.rotation = rotation;
    this.clearControls();
  }

  reconcile(x: number, z: number, rotation = this.rotation) {
    // Local arrival can precede acknowledgement of the final pose. Retain that
    // destination until another input/action cancels it, so a late correction
    // resumes the final metres instead of leaving the player short of the goal.
    const destination = this.navigationGoal;
    this.x = x;
    this.z = z;
    this.rotation = rotation;
    if (destination) {
      const path = findPath({ x, z }, destination);
      this.waypoints = path || [];
      this.target = path ? destination : null;
    }
  }

  update(dt: number, predictMovement = true) {
    dt = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), 0.05) : 0;
    this.moving = false;
    this.running = false;
    if (this.enabled && predictMovement) {
      let dx = 0,
        dz = 0;
      const keyboardForward =
        Number(this.keys.has('KeyW') || this.keys.has('ArrowUp')) -
        Number(this.keys.has('KeyS') || this.keys.has('ArrowDown'));
      const keyboardSide =
        Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) -
        Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'));
      const keyboardActive = keyboardForward !== 0 || keyboardSide !== 0;
      const forward = keyboardActive ? keyboardForward : this.moveInput.y;
      const side = keyboardActive ? keyboardSide : this.moveInput.x;
      const runningRequested = keyboardActive
        ? this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')
        : this.moveInput.run;
      const speed = (forward || side) && runningRequested ? 5.8 : 3.5;
      if (forward || side) {
        this.target = null;
        this.waypoints = [];
        this.overview = false;
        if (!this.meditating) this.distance = Math.min(this.distance, 20);
        dx = -Math.sin(this.yaw) * forward + Math.cos(this.yaw) * side;
        dz = -Math.cos(this.yaw) * forward - Math.sin(this.yaw) * side;
        const length = Math.hypot(dx, dz);
        if (length > 1) {
          dx /= length;
          dz /= length;
        }
      } else if (this.target) {
        while (
          this.waypoints.length &&
          Math.hypot(this.waypoints[0].x - this.x, this.waypoints[0].z - this.z) < 0.035
        ) {
          const reached = this.waypoints.shift()!;
          if (clearPath({ x: this.x, z: this.z }, reached)) {
            this.x = reached.x;
            this.z = reached.z;
          }
        }
        const waypoint = this.waypoints[0];
        if (waypoint) {
          dx = waypoint.x - this.x;
          dz = waypoint.z - this.z;
          const length = Math.hypot(dx, dz),
            magnitude = Math.min(1, length / Math.max(0.001, dt * 3.5));
          dx = (dx / length) * magnitude;
          dz = (dz / length) * magnitude;
        } else {
          if (clearPath({ x: this.x, z: this.z }, this.target)) {
            this.x = this.target.x;
            this.z = this.target.z;
          }
          this.activeTarget = null;
        }
      }
      if (dx || dz) {
        const oldX = this.x,
          oldZ = this.z,
          steps = Math.max(1, Math.ceil((dt * speed) / 0.08));
        for (let i = 0; i < steps; i++) {
          const sx = (dx * dt * speed) / steps,
            sz = (dz * dt * speed) / steps;
          if (walkable(this.x + sx, this.z + sz)) {
            this.x += sx;
            this.z += sz;
          } else {
            if (walkable(this.x + sx, this.z)) this.x += sx;
            if (walkable(this.x, this.z + sz)) this.z += sz;
          }
        }
        this.moving = Math.hypot(this.x - oldX, this.z - oldZ) > 0.0001;
        this.running = this.moving && !!(forward || side) && runningRequested;
        if (this.moving) {
          const desired = Math.atan2(dx, dz),
            difference = Math.atan2(Math.sin(desired - this.rotation), Math.cos(desired - this.rotation));
          this.rotation += difference * (1 - Math.exp(-dt * 13));
        }
      }
    } else if (!this.enabled) this.clearControls();
    const desiredFocus = this.overview
      ? new THREE.Vector3(-4, 1.6, 0)
      : new THREE.Vector3(
          this.meditating ? this.x * 0.35 : this.x,
          groundHeight(this.x, this.z) + (this.meditating ? 1.5 : 0.9),
          this.z - (this.meditating ? 3.2 : 0),
        );
    this.focus.lerp(desiredFocus, 1 - Math.exp(-dt * 3.5));
    const framing = this.overview
      ? Math.max(1, 1 / this.camera.aspect)
      : this.meditating
        ? Math.max(1, Math.min(1.4, 0.65 / this.camera.aspect))
        : 1;
    const effectiveDistance = this.distance * framing;
    const horizontal = Math.sin(this.polar) * effectiveDistance;
    const desiredPosition = new THREE.Vector3(
      this.focus.x + Math.sin(this.yaw) * horizontal,
      this.focus.y + Math.cos(this.polar) * effectiveDistance,
      this.focus.z + Math.cos(this.yaw) * horizontal,
    );
    this.camera.position.lerp(desiredPosition, 1 - Math.exp(-dt * 5));
    this.camera.lookAt(this.focus);
  }

  focusMeditation(active: boolean) {
    if (active === this.meditating) return;
    this.meditating = active;
    this.overview = false;
    if (active) {
      this.savedDistance = this.distance;
      this.distance = 18;
      this.polar = 1.05;
      this.yaw = 0.18;
    } else this.distance = THREE.MathUtils.clamp(this.savedDistance, 7, 52);
  }

  resetCamera() {
    this.yaw = 0.42;
    this.polar = 1.02;
    this.distance = 48;
    this.overview = true;
  }
  dispose() {
    this.listeners.forEach((remove) => remove());
    this.listeners = [];
    this.clearControls();
    this.pointers.clear();
  }
}
