import * as THREE from 'three';
import { createEnvironment } from './environment';
import { createCharacter } from './character';
import { PlayerController } from './controller';
import {
  BOW_DURATION,
  SEATS,
  INTERACTION_POINTS,
  LANDMARKS,
  groundHeight,
  type Action,
  type Player,
  type RoomSpec,
  type Snapshot,
  type AvatarStyle,
  type Quality,
  type WorldEvent,
  type WorldInteractionKind,
} from '../../shared/world';
import { TempleNetwork } from '../network';
import { TempleAudio } from '../audio';
import { getState, setState, toast, saveSetting } from '../state';

type Avatar = ReturnType<typeof createCharacter>;
export class TempleEngine {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(46, 1, 0.15, 220);
  renderer: THREE.WebGLRenderer;
  controller: PlayerController;
  environment: ReturnType<typeof createEnvironment>;
  audio = new TempleAudio();
  network: TempleNetwork;
  local: Avatar;
  private remotes = new Map<string, { avatar: Avatar; data: Player }>();
  private seats: Record<string, string> = {};
  private seenWorldEvents = new Set<string>();
  private selfId = '';
  private action: Action = 'idle';
  private actionAt = Date.now();
  private pendingSeat: string | null = null;
  private seatId: string | null = null;
  private claiming = false;
  private interactionRevision = 0;
  private transitionBusy = false;
  private claimFinished: Promise<void> | null = null;
  private bowLoop = false;
  private disposed = false;
  private frame = 0;
  private previous = 0;
  private elapsed = 0;
  private nextSend = 0;
  private nextUI = 0;
  private meditationTime = 0;
  private networkOffset = 0;
  private raycaster = new THREE.Raycaster();
  private observer: ResizeObserver;
  private marker: THREE.Mesh;
  private markerUntil = 0;
  private automaticLow = false;
  private slowFrames = 0;
  private sampleFrames = 0;
  private sampleStart = 0;
  private onInteractionKey = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if (
      !getState().joined ||
      event.repeat ||
      target?.isContentEditable ||
      /INPUT|TEXTAREA|SELECT/.test(target?.tagName)
    )
      return;
    if (event.code === 'KeyE' || event.code === 'KeyF') {
      event.preventDefault();
      void this.interact(event.code === 'KeyF');
    }
  };
  private onContextLost = (e: Event) => {
    e.preventDefault();
    setState({ error: 'Kết nối đồ họa bị gián đoạn. Tải lại trang để trở về sân chùa.' });
  };
  constructor(private host: HTMLElement) {
    setState({ loading: 25, loadingLabel: 'Khởi tạo WebGL', error: null });
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.98;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.setAttribute(
      'aria-label',
      'Không gian chùa An Nhiên 3D. Di chuyển bằng WASD hoặc chạm xuống mặt đất.',
    );
    this.renderer.domElement.tabIndex = 0;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
    this.scene.background = new THREE.Color('#d7e1cf');
    this.scene.fog = new THREE.FogExp2('#d7e1cf', 0.009);
    this.scene.add(new THREE.HemisphereLight('#fff1d6', '#809476', 1.65));
    const sun = new THREE.DirectionalLight('#ffe4b3', 3.1);
    sun.position.set(-24, 36, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -38;
    sun.shadow.camera.right = 38;
    sun.shadow.camera.top = 35;
    sun.shadow.camera.bottom = -35;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 100;
    sun.shadow.bias = -0.00045;
    sun.shadow.normalBias = 0.035;
    sun.shadow.radius = 3;
    this.scene.add(sun, sun.target);
    const fill = new THREE.DirectionalLight('#b4d5cd', 0.8);
    fill.position.set(14, 12, -20);
    this.scene.add(fill);
    setState({ loading: 40, loadingLabel: 'Dựng chùa và cảnh quan' });
    this.environment = createEnvironment();
    this.scene.add(this.environment.group);
    setState({ loading: 70, loadingLabel: 'Dựng nhân vật và vật liệu' });
    this.local = createCharacter(getState().name, getState().color, getState().avatar);
    this.scene.add(this.local.group);
    this.controller = new PlayerController(this.camera, this.renderer.domElement, (ndc) => this.tap(ndc));
    this.controller.enabled = false;
    window.addEventListener('keydown', this.onInteractionKey);
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.32, 0.39, 48),
      new THREE.MeshBasicMaterial({
        color: '#fbf3ce',
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.visible = false;
    this.scene.add(this.marker);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    this.setQuality(getState().quality);
    this.network = new TempleNetwork(
      getState().room,
      getState().name,
      getState().color,
      {
        snapshot: (s) => this.snapshot(s),
        status: (s) => this.connection(s),
        greet: (g) => {
          if (g.id !== this.selfId && Math.hypot(g.x - this.controller.x, g.z - this.controller.z) < 13)
            toast(`${g.name} chắp tay chào bạn.`);
        },
        error: toast,
        chat: (message) => setState({ messages: [...getState().messages, message].slice(-100) }),
        worldEvent: (event) => this.worldEvent(event),
        presence: (event) => {
          if (event.id !== this.selfId && !getState().blockedIds.includes(event.id))
            toast(`${event.name} ${event.kind === 'join' ? 'vừa đến sân chùa.' : 'đã rời phòng.'}`);
        },
        correction: (pose) => {
          // Rebase movement without dropping a held key or the user's destination.
          // A delayed authoritative correction must not strand an auto-walking player.
          this.controller.reconcile(pose.x, pose.z, pose.rotation);
          this.setAction(pose.action);
        },
      },
      { autoJoin: false, avatar: getState().avatar },
    );
    setState({ loading: 85, loadingLabel: 'Chuẩn bị shader trên GPU' });
    void this.renderer
      .compileAsync(this.scene, this.camera)
      .then(() => {
        if (this.disposed) return;
        this.renderer.render(this.scene, this.camera);
        setState({ loading: 100, loadingLabel: 'Sẵn sàng', ready: true });
      })
      .catch(() => {
        if (!this.disposed) setState({ error: 'Chưa thể chuẩn bị đồ họa. Hãy tải lại trang.' });
      });
    this.frame = requestAnimationFrame(this.tick);
  }
  private resize() {
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    this.camera.aspect = w / Math.max(h, 1);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }
  setQuality(q: Quality) {
    setState({ quality: q });
    saveSetting('an-nhien-quality', q);
    const low = q === 'low' || (q === 'auto' && (window.innerWidth < 700 || this.automaticLow));
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, low ? 1 : q === 'high' ? 1.65 : 1.25));
    this.renderer.shadowMap.enabled = !low;
    this.environment.setQuality(low ? 'low' : q === 'high' ? 'high' : 'medium');
    this.resize();
  }
  private connection(status: 'connecting' | 'online' | 'offline') {
    setState({ status });
    if (status !== 'online') {
      this.interactionRevision++;
      this.clearRemotes();
      this.seats = {};
      this.seenWorldEvents.clear();
      this.environment.resetInteractions();
      setState({ worldEvents: [] });
      this.environment.setOccupied(this.seatId ? { [this.seatId]: 'local' } : {});
      setState({ online: 0, players: [], selfId: '' });
      this.selfId = '';
    }
  }
  private clearRemotes() {
    this.remotes.forEach(({ avatar }) => {
      this.scene.remove(avatar.group);
      avatar.dispose();
    });
    this.remotes.clear();
  }
  private worldEvent(event: WorldEvent, silent = false) {
    if (this.seenWorldEvents.has(event.id)) return;
    this.seenWorldEvents.add(event.id);
    if (this.seenWorldEvents.size > 64)
      this.seenWorldEvents.delete(this.seenWorldEvents.values().next().value!);
    const age = Math.max(0, (Date.now() + this.networkOffset - event.at) / 1000);
    this.environment.triggerInteraction(event.kind, age);
    setState({ worldEvents: [...getState().worldEvents, event].slice(-12) });
    if (silent) return;
    if (event.kind === 'bell' && age < 2 && this.audio.channels.bell) {
      const point = INTERACTION_POINTS.bell;
      const distance = Math.hypot(this.controller.x - point.x, this.controller.z - point.z);
      this.audio.bell(Math.max(0, 1 - distance / 36));
    }
    if (!getState().blockedIds.includes(event.playerId))
      toast(
        `${event.name} ${event.kind === 'bell' ? 'vừa thỉnh chuông chùa.' : 'vừa thả một ngọn đèn trên hồ sen.'}`,
      );
  }
  private snapshot(s: Snapshot) {
    this.networkOffset = s.serverTime - Date.now();
    this.seats = s.seats;
    this.environment.setOccupied(s.seats);
    setState({ online: s.players.length, room: s.room, players: s.players, selfId: s.selfId });
    const self = s.players.find((p) => p.id === s.selfId);
    if (s.selfId !== this.selfId && self) {
      this.selfId = s.selfId;
      this.controller.teleport(self.x, self.z, self.rotation);
      this.seatId = self.seatId;
      this.pendingSeat = null;
      this.claiming = false;
      this.bowLoop = false;
      this.setAction(self.action);
      this.controller.enabled = !self.seatId;
      this.controller.focusMeditation(!!self.seatId);
      setState({ seated: self.seatId, pendingSeat: null, bowRunning: false });
      if (getState().joined && !this.transitionBusy) {
        const id = self.id,
          key = s.room.key;
        void this.network.worldHistory().then((ack) => {
          if (this.disposed || this.selfId !== id || getState().room.key !== key) return;
          for (const event of ack.events || []) this.worldEvent(event, true);
        });
      }
    }
    const visible = new Set(s.players.filter((p) => p.id !== s.selfId).map((p) => p.id));
    for (const [id, { avatar }] of this.remotes)
      if (!visible.has(id)) {
        this.scene.remove(avatar.group);
        avatar.dispose();
        this.remotes.delete(id);
      }
    for (const p of s.players) {
      if (p.id === s.selfId) continue;
      let existing = this.remotes.get(p.id);
      if (existing && (existing.data.color !== p.color || existing.data.avatar !== p.avatar)) {
        this.scene.remove(existing.avatar.group);
        existing.avatar.dispose();
        this.remotes.delete(p.id);
        existing = undefined;
      }
      if (existing) {
        if (existing.data.name !== p.name) existing.avatar.setName(p.name);
        existing.data = p;
      } else {
        const avatar = createCharacter(p.name, p.color, p.avatar);
        avatar.group.position.set(p.x, groundHeight(p.x, p.z), p.z);
        avatar.group.rotation.y = p.rotation;
        this.scene.add(avatar.group);
        this.remotes.set(p.id, { avatar, data: p });
      }
    }
  }
  private setAction(action: Action) {
    if (this.action === action) return;
    this.action = action;
    this.actionAt = Date.now();
    setState({ action });
  }
  private tap(ndc: THREE.Vector2) {
    if (!getState().joined) return;
    if (this.action === 'bow') {
      toast('Chờ hoàn tất lượt lễ, hoặc nhấn dừng.');
      return;
    }
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.environment.pickables, true);
    for (const hit of hits) {
      let object: THREE.Object3D | null = hit.object;
      while (object && !object.userData.seatId && !object.userData.ground) object = object.parent;
      if (object?.userData.seatId) {
        void this.meditate(object.userData.seatId);
        return;
      }
      if (object?.userData.ground) {
        void this.navigate(hit.point.x, hit.point.z);
        return;
      }
    }
  }
  async navigate(x: number, z: number) {
    if (!getState().joined) return;
    if (this.action === 'bow' || this.transitionBusy) return;
    this.transitionBusy = true;
    try {
      if (!(await this.stand())) return;
      if (this.controller.setTarget(x, z)) {
        this.marker.position.set(x, groundHeight(x, z) + 0.04, z);
        this.markerUntil = this.elapsed + 3;
        this.marker.visible = true;
      } else toast('Lối này có vật cản. Hãy chọn khoảng sân trống.');
    } finally {
      this.transitionBusy = false;
    }
  }
  async meditate(id?: string) {
    if (!getState().joined) return;
    setState({ started: true });
    if (this.transitionBusy || this.claiming) return;
    if (this.action === 'bow') {
      toast('Hãy hoàn tất lượt lễ trước khi ngồi thiền.');
      return;
    }
    if (this.seatId) {
      await this.stand();
      return;
    }
    const available = SEATS.filter((s) => !this.seats[s.id]).sort(
      (a, b) =>
        Math.hypot(a.x - this.controller.x, a.z - this.controller.z) -
        Math.hypot(b.x - this.controller.x, b.z - this.controller.z),
    );
    const seat = id ? SEATS.find((s) => s.id === id) : available[0];
    if (!seat || this.seats[seat.id]) {
      toast('Bồ đoàn đã có người. Mời bạn chọn chỗ khác.');
      return;
    }
    this.interactionRevision++;
    this.controller.enabled = true;
    this.pendingSeat = seat.id;
    this.setAction('idle');
    setState({ pendingSeat: seat.id });
    if (!this.controller.setTarget(seat.x, seat.z)) {
      this.pendingSeat = null;
      setState({ pendingSeat: null });
      toast('Chưa tìm được đường đến bồ đoàn này.');
    } else toast('Đang bước nhẹ đến bồ đoàn…');
  }
  private async claimSeat() {
    if (!this.pendingSeat || this.claiming) return;
    const id = this.pendingSeat,
      revision = this.interactionRevision,
      socketId = this.network.socket.id,
      roomKey = this.network.spec;
    this.claiming = true;
    this.controller.enabled = false;
    let finish!: () => void;
    this.claimFinished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    try {
      if (this.network.joined) {
        const positionAck = await this.network.syncPose(this.currentPose());
        if (this.disposed || revision !== this.interactionRevision || this.pendingSeat !== id) return;
        if (!positionAck.ok) {
          this.pendingSeat = null;
          setState({ pendingSeat: null });
          toast(positionAck.error || 'Chưa đồng bộ được vị trí. Hãy thử ngồi lại.');
          return;
        }
        const ack = await this.network.request('seat:claim', { seatId: id });
        if (this.disposed) return;
        if (revision !== this.interactionRevision || this.pendingSeat !== id) {
          if (
            ack.ok &&
            this.network.joined &&
            socketId === this.network.socket.id &&
            roomKey === this.network.spec
          )
            await this.network.request('seat:release');
          return;
        }
        if (!ack.ok) {
          this.pendingSeat = null;
          setState({ pendingSeat: null });
          toast(ack.error || 'Chỗ này vừa có người ngồi.');
          return;
        }
      }
      const seat = SEATS.find((s) => s.id === id)!;
      this.controller.teleport(seat.x, seat.z, seat.rotation);
      this.seatId = id;
      this.pendingSeat = null;
      this.controller.focusMeditation(true);
      this.setAction('sit');
      this.meditationTime = 0;
      setState({ seated: id, pendingSeat: null, meditationSeconds: 0 });
      if (!this.network.joined) this.environment.setOccupied({ [id]: 'local' });
      toast('Thả lỏng đôi vai. Trở về với hơi thở.');
    } finally {
      this.claiming = false;
      this.claimFinished = null;
      if (!this.seatId) this.controller.enabled = true;
      finish();
    }
  }
  async stand(): Promise<boolean> {
    this.interactionRevision++;
    this.pendingSeat = null;
    this.controller.target = null;
    setState({ pendingSeat: null });
    if (this.claimFinished) await this.claimFinished;
    if (this.seatId && this.network.joined) {
      const ack = await this.network.request('seat:release');
      if (!ack.ok && this.network.joined) {
        toast(ack.error || 'Chưa thể đứng dậy.');
        return false;
      }
    }
    if (this.disposed) return false;
    this.seatId = null;
    this.controller.enabled = true;
    this.controller.focusMeditation(false);
    if (this.action !== 'bow') this.setAction('idle');
    setState({ seated: null });
    if (!this.network.joined) this.environment.setOccupied({});
    return true;
  }
  async bow() {
    if (!getState().joined) return;
    setState({ started: true });
    if (this.transitionBusy) return;
    if (this.action === 'bow') {
      this.bowLoop = !this.bowLoop;
      setState({ bowRunning: this.bowLoop });
      toast(this.bowLoop ? 'Tiếp tục lễ sau lượt này.' : 'Sẽ dừng khi hoàn tất lượt lễ hiện tại.');
      return;
    }
    this.transitionBusy = true;
    try {
      if (!(await this.stand())) return;
      const revision = this.interactionRevision;
      this.controller.enabled = false;
      const positionAck = this.network.joined
        ? await this.network.syncPose(this.currentPose())
        : { ok: true };
      if (this.disposed || revision !== this.interactionRevision || !getState().joined) return;
      if (!positionAck.ok) {
        this.controller.enabled = true;
        return;
      }
      if (getState().bows >= 108) setState({ bows: 0 });
      this.bowLoop = true;
      setState({ bowRunning: true });
      this.beginBow();
    } finally {
      this.transitionBusy = false;
    }
  }
  private beginBow() {
    this.controller.enabled = false;
    this.controller.target = null;
    this.controller.rotation = Math.PI;
    this.action = 'idle';
    this.setAction('bow');
    this.network.action('bow');
  }
  async greet() {
    if (!getState().joined) return;
    setState({ started: true });
    if (this.action === 'bow' || this.transitionBusy || this.action === 'greet') return;
    this.transitionBusy = true;
    try {
      if (!(await this.stand())) return;
      const revision = this.interactionRevision;
      this.controller.target = null;
      this.controller.enabled = false;
      const positionAck = this.network.joined
        ? await this.network.syncPose(this.currentPose())
        : { ok: true };
      if (this.disposed || revision !== this.interactionRevision || !getState().joined) return;
      if (!positionAck.ok) {
        this.controller.enabled = true;
        return;
      }
      this.setAction('greet');
      this.network.action('greet');
    } finally {
      this.transitionBusy = false;
    }
  }
  nextBead() {
    if (getState().beads >= 108) return;
    const beads = getState().beads + 1;
    setState({ beads });
    this.audio.bead();
    if (beads === 108) {
      this.audio.complete();
      toast('Trọn một vòng 108 hạt. Nguyện tâm luôn an lành.');
    }
  }
  resetBeads() {
    setState({ beads: 0 });
  }
  async enter(spec = this.network.spec) {
    const joined = await this.changeRoom(spec);
    if (!joined) return false;
    setState({ started: true, joined: true });
    this.controller.enabled = true;
    await this.audio.start();
    setState({ sound: true });
    this.audio.bell();
    void this.navigate(0, 11.5);
    return true;
  }
  async createRoom(visibility: 'public' | 'private', room?: string) {
    const ack = await this.network.createRoom({
      visibility,
      room,
      region: this.network.spec.region,
      instance: 0,
    });
    if (!ack.ok || !ack.room) {
      toast(ack.error || 'Chưa tạo được phòng.');
      return false;
    }
    return this.enter(ack.room);
  }
  async leave() {
    await this.stand();
    await this.network.leave();
    this.bowLoop = false;
    this.setAction('idle');
    this.controller.enabled = false;
    this.controller.resetCamera();
    this.clearRemotes();
    this.seenWorldEvents.clear();
    this.environment.resetInteractions();
    setState({
      joined: false,
      started: false,
      online: 0,
      players: [],
      messages: [],
      worldEvents: [],
      panel: null,
      bowRunning: false,
    });
  }
  async interact(meditationOnly = false) {
    if (this.seatId) {
      await this.stand();
      return;
    }
    if (this.action === 'pray') {
      this.setAction('idle');
      this.controller.enabled = true;
      this.network.action('idle');
      return;
    }
    const altar = INTERACTION_POINTS.altar;
    if (
      !meditationOnly &&
      Math.hypot(this.controller.x - altar.x, this.controller.z - altar.z) <= altar.radius
    ) {
      await this.emote('pray');
      return;
    }
    if (!meditationOnly) {
      for (const kind of ['bell', 'lantern'] as const) {
        const point = INTERACTION_POINTS[kind];
        if (Math.hypot(this.controller.x - point.x, this.controller.z - point.z) <= point.radius) {
          await this.interactWorld(kind);
          return;
        }
      }
    }
    const seat = SEATS.find(
      (s) => !this.seats[s.id] && Math.hypot(s.x - this.controller.x, s.z - this.controller.z) < 1.8,
    );
    if (seat) await this.meditate(seat.id);
    else toast('Đến gần bồ đoàn để ngồi thiền, hoặc trước tượng Phật để cầu nguyện.');
  }
  async emote(action: 'pray' | 'wave') {
    if (!getState().joined || this.transitionBusy || this.action === 'bow') return;
    this.transitionBusy = true;
    try {
      if (!(await this.stand())) return;
      const revision = this.interactionRevision;
      this.controller.enabled = false;
      const positionAck = await this.network.syncPose(this.currentPose());
      if (this.disposed || revision !== this.interactionRevision || !getState().joined) return;
      if (!positionAck.ok) {
        this.controller.enabled = true;
        toast(positionAck.error || 'Chưa đồng bộ được vị trí.');
        return;
      }
      const ack = await this.network.request('action', { action });
      if (this.disposed || revision !== this.interactionRevision || !getState().joined) return;
      if (!ack.ok) {
        this.controller.enabled = true;
        toast(ack.error || 'Chưa thể thực hiện.');
        return;
      }
      if (action === 'pray') this.controller.rotation = Math.PI;
      this.setAction(action);
    } finally {
      this.transitionBusy = false;
    }
  }
  async interactWorld(kind: WorldInteractionKind) {
    if (!getState().joined || this.transitionBusy || this.action === 'bow') return;
    this.transitionBusy = true;
    try {
      if (!(await this.stand())) return;
      const revision = this.interactionRevision;
      this.controller.enabled = false;
      const positionAck = await this.network.syncPose(this.currentPose());
      if (this.disposed || revision !== this.interactionRevision || !getState().joined) return;
      if (!positionAck.ok) {
        toast(positionAck.error || 'Chưa đồng bộ được vị trí.');
        this.controller.enabled = true;
        return;
      }
      const ack = await this.network.interactWorld(kind);
      if (this.disposed || revision !== this.interactionRevision || !getState().joined) return;
      this.controller.enabled = true;
      if (!ack.ok) toast(ack.error || 'Chưa thể tương tác.');
    } finally {
      this.transitionBusy = false;
    }
  }
  inviteLink() {
    const url = new URL(location.href);
    const spec = this.network.spec;
    url.search = new URLSearchParams({
      room: spec.room,
      instance: String(spec.instance),
      region: spec.region,
      ...(spec.invite ? { invite: spec.invite } : {}),
    }).toString();
    return url.toString();
  }
  setSound(enabled: boolean) {
    this.audio.setMuted(!enabled);
    setState({ sound: enabled });
  }
  toggleChannel(channel: string) {
    this.audio.toggle(channel);
    setState({ channels: { ...this.audio.channels } });
  }
  setVolume(v: number) {
    this.audio.setVolume(v);
    setState({ volume: v });
  }
  async changeRoom(spec: RoomSpec) {
    if (this.transitionBusy) return false;
    this.transitionBusy = true;
    this.interactionRevision++;
    if (this.claimFinished) await this.claimFinished;
    this.bowLoop = false;
    this.pendingSeat = null;
    this.seatId = null;
    this.controller.enabled = true;
    this.controller.focusMeditation(false);
    this.setAction('idle');
    setState({ bowRunning: false, seated: null, pendingSeat: null, panel: null });
    try {
      const ack = await this.network.join(spec);
      if (ack.ok) {
        this.selfId = '';
        if (ack.snapshot) this.snapshot(ack.snapshot);
        const url = new URL(location.href);
        url.search = new URLSearchParams({
          room: spec.room,
          instance: String(spec.instance),
          region: spec.region,
          ...(spec.invite ? { invite: spec.invite } : {}),
        }).toString();
        history.replaceState(null, '', url);
        const historyAck = await this.network.chatHistory();
        setState({ messages: historyAck.messages || [], joined: true });
        const worldHistory = await this.network.worldHistory();
        for (const event of worldHistory.events || []) this.worldEvent(event, true);
        toast(`Đã vào phòng ${spec.room}.`);
      }
      return ack.ok;
    } finally {
      this.transitionBusy = false;
    }
  }
  async updateIdentity(name: string, color: string, avatar: AvatarStyle = getState().avatar) {
    saveSetting('an-nhien-name', name);
    saveSetting('an-nhien-color', color);
    saveSetting('sansa-avatar', avatar);
    setState({ name, color, avatar });
    this.local.setName(name);
    if (color !== this.network.color || avatar !== this.network.avatar) {
      this.scene.remove(this.local.group);
      this.local.dispose();
      this.local = createCharacter(name, color, avatar);
      this.scene.add(this.local.group);
    }
    this.network.name = name;
    this.network.color = color;
    this.network.avatar = avatar;
    if (this.network.joined) await this.changeRoom(this.network.spec);
  }
  resetCamera() {
    this.controller.resetCamera();
  }
  private currentPose() {
    return {
      x: this.controller.x,
      z: this.controller.z,
      rotation: this.controller.rotation,
      action: this.action,
      actionAt: this.actionAt,
    };
  }
  private sendPose() {
    this.network.pose(this.currentPose());
  }
  private tick = (now: number) => {
    if (this.disposed) return;
    const dt = Math.min((now - this.previous) / 1000 || 0.016, 0.05);
    this.previous = now;
    this.elapsed += dt;
    this.controller.update(dt);
    if (this.controller.moving && !getState().started) setState({ started: true });
    if (this.action === 'bow') {
      if (Date.now() - this.actionAt >= BOW_DURATION) {
        const bows = Math.min(108, getState().bows + 1);
        setState({ bows });
        if (bows === 108) {
          this.audio.complete();
          toast('108 lễ đã viên mãn. Xin giữ một tâm an lành.');
          this.bowLoop = false;
        }
        if (this.bowLoop) this.beginBow();
        else {
          this.setAction('idle');
          this.controller.enabled = true;
          setState({ bowRunning: false });
          this.network.action('idle');
        }
      }
    } else if (this.action === 'greet' || this.action === 'wave' || this.action === 'pray') {
      if (Date.now() - this.actionAt > (this.action === 'pray' ? 7000 : 2200)) {
        this.setAction('idle');
        this.controller.enabled = true;
        this.network.action('idle');
      }
    } else if (this.action !== 'sit')
      this.setAction(this.controller.moving ? (this.controller.running ? 'run' : 'walk') : 'idle');
    if (this.pendingSeat && !this.claiming) {
      const seat = SEATS.find((s) => s.id === this.pendingSeat)!;
      if (Math.hypot(this.controller.x - seat.x, this.controller.z - seat.z) < 0.38) void this.claimSeat();
      else if (!this.controller.target) {
        this.pendingSeat = null;
        setState({ pendingSeat: null });
      }
    }
    if (this.action === 'sit') this.meditationTime += dt;
    const targetY = groundHeight(this.controller.x, this.controller.z) + (this.action === 'sit' ? 0.15 : 0);
    this.local.group.position.set(
      this.controller.x,
      THREE.MathUtils.damp(this.local.group.position.y, targetY, 14, dt),
      this.controller.z,
    );
    this.local.group.rotation.y = this.controller.rotation;
    this.local.update(dt, this.elapsed, this.action, (Date.now() - this.actionAt) / 1000);
    const alpha = 1 - Math.exp(-12 * dt);
    this.remotes.forEach(({ avatar, data }) => {
      const distance = Math.hypot(data.x - this.controller.x, data.z - this.controller.z);
      avatar.group.visible = !getState().hiddenIds.includes(data.id);
      avatar.setDetail(distance < 14);
      avatar.setLabelVisible(distance < 10 && !getState().hiddenIds.includes(data.id));
      avatar.group.position.lerp(
        new THREE.Vector3(data.x, groundHeight(data.x, data.z) + (data.action === 'sit' ? 0.15 : 0), data.z),
        alpha,
      );
      const diff = Math.atan2(
        Math.sin(data.rotation - avatar.group.rotation.y),
        Math.cos(data.rotation - avatar.group.rotation.y),
      );
      avatar.group.rotation.y += diff * alpha;
      avatar.update(
        dt,
        this.elapsed,
        data.action,
        Math.max(0, (Date.now() + this.networkOffset - data.actionAt) / 1000),
      );
    });
    this.environment.update(this.elapsed, dt, { x: this.controller.x, z: this.controller.z });
    if (this.marker.visible) {
      const pulse = 1 + Math.sin(this.elapsed * 5) * 0.08;
      this.marker.scale.setScalar(pulse);
      if (this.elapsed > this.markerUntil) this.marker.visible = false;
    }
    if (this.elapsed > this.nextSend) {
      this.sendPose();
      this.nextSend = this.elapsed + 0.08;
    }
    if (this.elapsed > this.nextUI) {
      const state = getState();
      const visited = LANDMARKS.filter(
        (p) => Math.hypot(this.controller.x - p.x, this.controller.z - p.z) < 4,
      ).map((p) => p.id);
      const altar = INTERACTION_POINTS.altar;
      const closeAltar = Math.hypot(this.controller.x - altar.x, this.controller.z - altar.z) < altar.radius;
      const closeSeat = SEATS.some(
        (s) => !this.seats[s.id] && Math.hypot(this.controller.x - s.x, this.controller.z - s.z) < 1.8,
      );
      setState({
        x: this.controller.x,
        z: this.controller.z,
        meditationSeconds: Math.floor(this.meditationTime),
        visited: state.joined ? [...new Set([...state.visited, ...visited])] : state.visited,
        interaction: this.seatId
          ? 'Đứng dậy'
          : this.action === 'pray'
            ? 'Kết thúc cầu nguyện'
            : closeAltar
              ? 'Cầu nguyện'
              : closeSeat
                ? 'Ngồi thiền'
                : Math.hypot(
                      this.controller.x - INTERACTION_POINTS.bell.x,
                      this.controller.z - INTERACTION_POINTS.bell.z,
                    ) <= INTERACTION_POINTS.bell.radius
                  ? 'Thỉnh chuông'
                  : Math.hypot(
                        this.controller.x - INTERACTION_POINTS.lantern.x,
                        this.controller.z - INTERACTION_POINTS.lantern.z,
                      ) <= INTERACTION_POINTS.lantern.radius
                    ? 'Thả đèn hoa đăng'
                    : '',
      });
      this.nextUI = this.elapsed + 0.25;
    }
    if (getState().quality === 'auto' && !this.automaticLow) {
      this.slowFrames = dt > 0.033 ? this.slowFrames + 1 : Math.max(0, this.slowFrames - 1);
      if (this.slowFrames > 180) {
        this.automaticLow = true;
        this.setQuality('auto');
      }
    }
    this.renderer.render(this.scene, this.camera);
    this.sampleFrames++;
    if (now - this.sampleStart > 2000) {
      setState({
        fps: Math.round((this.sampleFrames * 1000) / (now - this.sampleStart)),
        drawCalls: this.renderer.info.render.calls,
      });
      this.sampleStart = now;
      this.sampleFrames = 0;
    }
    this.frame = requestAnimationFrame(this.tick);
  };
  dispose() {
    this.disposed = true;
    this.interactionRevision++;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.controller.dispose();
    window.removeEventListener('keydown', this.onInteractionKey);
    this.network.dispose();
    this.audio.dispose();
    this.clearRemotes();
    this.local.dispose();
    this.environment.dispose();
    this.scene.traverse((o) => {
      if (o instanceof THREE.DirectionalLight) o.shadow.dispose();
    });
    this.marker.geometry.dispose();
    (this.marker.material as THREE.Material).dispose();
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
