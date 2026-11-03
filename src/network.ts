import { io, type Socket } from 'socket.io-client';
import type {
  Ack,
  AvatarStyle,
  ChatMessage,
  Pose,
  PresenceEvent,
  RoomSpec,
  Snapshot,
  WorldEvent,
  WorldInteractionKind,
} from '../shared/world';
export interface NetworkOptions {
  autoJoin?: boolean;
  avatar?: AvatarStyle;
  url?: string;
}
export type PoseAck = Ack & { corrected?: boolean };
export class TempleNetwork {
  socket: Socket;
  joined = false;
  spec: RoomSpec;
  name: string;
  color: string;
  avatar: AvatarStyle;
  readonly sessionId =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
          byte.toString(16).padStart(2, '0'),
        ).join('');
  private revision = 0;
  private lastSnapshot: Snapshot | null = null;
  private disposed = false;
  private wantsJoin: boolean;
  private joining = false;
  private pendingPose: { pose: Pose; sequence: number } | null = null;
  private poseFlight: number | null = null;
  private poseSequence = 0;
  private acknowledgedPosition: { x: number; z: number } | null = null;
  private poseWaiters = new Map<number, (ack: PoseAck) => void>();
  private onPageHide = () => {
    // Explicitly notify the server before navigation; the transport may otherwise linger until its heartbeat expires.
    if (!this.disposed) this.socket.disconnect();
  };
  private onPageShow = (event: PageTransitionEvent) => {
    if (event.persisted && !this.disposed) this.socket.connect();
  };
  constructor(
    spec: RoomSpec,
    name: string,
    color: string,
    private handlers: {
      snapshot: (s: Snapshot) => void;
      status: (s: 'connecting' | 'online' | 'offline') => void;
      greet: (g: { id: string; name: string; x: number; z: number }) => void;
      error: (s: string) => void;
      chat?: (message: ChatMessage) => void;
      presence?: (event: PresenceEvent) => void;
      correction?: (pose: Pose) => void;
      worldEvent?: (event: WorldEvent) => void;
    },
    options: NetworkOptions = {},
  ) {
    this.spec = spec;
    this.name = name;
    this.color = color;
    this.avatar = options.avatar ?? 'dck';
    this.wantsJoin = options.autoJoin ?? true;
    this.socket = io(options.url, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      tryAllTransports: true,
      reconnection: true,
      reconnectionDelay: 900,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });
    this.socket.on('connect', () => {
      if (this.wantsJoin && !this.joining) void this.join();
      else if (!this.wantsJoin) handlers.status('online');
    });
    this.socket.on('snapshot', (s: Snapshot) => {
      if (this.joined) {
        this.lastSnapshot = s;
        this.handlers.snapshot(s);
      }
    });
    this.socket.on('greet', handlers.greet);
    this.socket.on('server:full', () =>
      handlers.error('Máy chủ đang đông. Hãy thử kết nối lại sau một lúc.'),
    );
    this.socket.on('chat', (message: ChatMessage) => {
      if (this.joined) handlers.chat?.(message);
    });
    this.socket.on('presence', (event: PresenceEvent) => {
      if (this.joined) handlers.presence?.(event);
    });
    this.socket.on('world:event', (event: WorldEvent) => {
      if (this.joined) handlers.worldEvent?.(event);
    });
    this.socket.on('correction', (pose: Pose) => {
      if (this.joined) {
        this.acknowledgedPosition = { x: pose.x, z: pose.z };
        // Predictions queued before reconciliation no longer describe our position.
        this.pendingPose = null;
        // The correction settles the rejected flight. Its ACK may arrive in a
        // later packet and must not cancel a new pose queued after reconciliation.
        this.poseFlight = null;
        this.resolvePoses(Infinity, {
          ok: false,
          corrected: true,
          error: 'Vị trí vừa được đồng bộ lại. Hãy thử tương tác lại.',
        });
        handlers.correction?.(pose);
      }
    });
    this.socket.on('disconnect', () => {
      this.revision++;
      this.joined = false;
      this.joining = false;
      this.lastSnapshot = null;
      this.resetPoses();
      handlers.status('offline');
    });
    this.socket.on('connect_error', () => {
      this.joined = false;
      handlers.status('offline');
    });
    this.socket.io.on('reconnect_attempt', () => handlers.status('connecting'));
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', this.onPageHide);
      window.addEventListener('pageshow', this.onPageShow);
    }
    this.socket.connect();
  }
  async join(spec = this.spec) {
    if (this.joining) return { ok: false, error: 'Đang vào phòng. Vui lòng chờ một chút.' } as Ack;
    const revision = ++this.revision,
      previousSpec = this.spec,
      previousSnapshot = this.lastSnapshot,
      wasJoined = this.joined;
    this.wantsJoin = true;
    this.joining = true;
    this.spec = spec;
    this.joined = false;
    this.resetPoses();
    this.handlers.status('connecting');
    await this.whenConnected();
    if (revision !== this.revision || this.disposed)
      return { ok: false, error: 'Thao tác đã được thay thế.' } as Ack;
    const ack = await this.request('join', {
      ...spec,
      name: this.name,
      color: this.color,
      avatar: this.avatar,
      sessionId: this.sessionId,
    });
    if (revision !== this.revision || this.disposed)
      return { ok: false, error: 'Thao tác đã được thay thế.' } as Ack;
    this.joining = false;
    if (ack.ok && ack.snapshot) {
      this.joined = true;
      this.lastSnapshot = ack.snapshot;
      this.anchorPosition(ack.snapshot);
      this.handlers.status('online');
      this.handlers.snapshot(ack.snapshot);
    } else if (wasJoined && this.socket.connected && previousSnapshot) {
      this.spec = previousSpec;
      this.joined = true;
      this.lastSnapshot = previousSnapshot;
      this.anchorPosition(previousSnapshot);
      this.handlers.status('online');
      this.handlers.snapshot(previousSnapshot);
      this.handlers.error(ack.error || 'Chưa thể đổi phòng. Bạn vẫn ở phòng trước.');
    } else {
      this.wantsJoin = false;
      this.handlers.status('offline');
      this.handlers.error(ack.error || 'Chưa thể vào phòng. Bạn vẫn có thể khám phá một mình.');
    }
    return ack;
  }
  private whenConnected(): Promise<void> {
    if (this.socket.connected || this.disposed) return Promise.resolve();
    return new Promise((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        this.socket.off('connect', finish);
        resolve();
      };
      const timer = setTimeout(finish, 12000);
      this.socket.once('connect', finish);
    });
  }
  async createRoom(options: {
    room?: string;
    instance?: number;
    region?: string;
    visibility: 'public' | 'private';
  }) {
    await this.whenConnected();
    return this.request('create-room', { region: this.spec.region, instance: 0, ...options });
  }
  sendChat(text: string) {
    return this.request('chat:send', { text });
  }
  chatHistory() {
    return this.request('chat:history', {});
  }
  interactWorld(kind: WorldInteractionKind) {
    return this.request('world:interact', { kind });
  }
  worldHistory() {
    return this.request('world:history', {});
  }
  async leave() {
    this.revision++;
    this.wantsJoin = false;
    this.joining = false;
    this.joined = false;
    this.lastSnapshot = null;
    this.resetPoses();
    return this.request('leave', {});
  }
  request(event: string, data: unknown = {}): Promise<Ack> {
    return new Promise((resolve) => {
      if (!this.socket.connected) {
        resolve({ ok: false, error: 'Máy chủ chưa kết nối.' });
        return;
      }
      this.socket
        .timeout(4500)
        .emit(event, data, (err: Error | null, ack: Ack) =>
          resolve(
            err
              ? { ok: false, error: 'Kết nối đang chậm. Vui lòng thử lại.' }
              : ack || { ok: false, error: 'Phản hồi không hợp lệ.' },
          ),
        );
    });
  }
  pose(pose: Pose) {
    this.queuePose(pose);
  }
  private anchorPosition(snapshot: Snapshot) {
    const self = snapshot.players.find((player) => player.id === snapshot.selfId);
    this.acknowledgedPosition = self ? { x: self.x, z: self.z } : null;
  }
  canPredict(x: number, z: number) {
    const anchor = this.acknowledgedPosition;
    // Stay inside the server's 0.55-second walking credit even if an entire
    // frame of running follows this check. Resume as soon as its ACK arrives.
    return !this.joined || !anchor || Math.hypot(x - anchor.x, z - anchor.z) < 1.4;
  }
  syncPose(pose: Pose): Promise<PoseAck> {
    return new Promise((resolve) => this.queuePose(pose, resolve));
  }
  private queuePose(pose: Pose, resolve?: (ack: PoseAck) => void) {
    if (!this.joined || !this.socket.connected) {
      resolve?.({ ok: false, error: 'Máy chủ chưa kết nối.' });
      return;
    }
    // Position is replaceable state. Keep only the newest prediction while an
    // acknowledged update is in flight, rather than accumulating stale TCP frames.
    const sequence = ++this.poseSequence;
    if (resolve) this.poseWaiters.set(sequence, resolve);
    this.pendingPose = { pose: { ...pose }, sequence };
    this.flushPose();
  }
  private resolvePoses(through: number, ack: PoseAck) {
    for (const [sequence, resolve] of this.poseWaiters) {
      if (sequence <= through) {
        this.poseWaiters.delete(sequence);
        resolve(ack);
      }
    }
  }
  private resetPoses() {
    this.pendingPose = null;
    this.poseFlight = null;
    this.acknowledgedPosition = null;
    this.resolvePoses(Infinity, { ok: false, error: 'Phiên di chuyển đã thay đổi.' });
  }
  private flushPose() {
    if (!this.joined || !this.socket.connected || this.poseFlight !== null || !this.pendingPose) return;
    const { pose, sequence } = this.pendingPose;
    this.pendingPose = null;
    this.poseFlight = sequence;
    this.socket.timeout(4500).emit('pose', pose, (error: Error | null, ack: Ack) => {
      if (this.disposed || this.poseFlight !== sequence) return;
      this.poseFlight = null;
      if (error) {
        this.pendingPose = null;
        this.resolvePoses(Infinity, { ok: false, error: 'Kết nối đang chậm. Đang kết nối lại.' });
        // An unacknowledged update has an unknown outcome. Reconnect before
        // sending more predictions, then use the new authoritative join position.
        this.socket.io.engine?.close();
        return;
      }
      if (!ack?.ok) {
        this.pendingPose = null;
        this.resolvePoses(Infinity, ack || { ok: false, error: 'Phản hồi vị trí không hợp lệ.' });
        return;
      }
      this.acknowledgedPosition = { x: pose.x, z: pose.z };
      this.resolvePoses(sequence, ack);
      this.flushPose();
    });
  }
  action(action: string) {
    if (this.joined) this.socket.emit('action', { action });
  }
  dispose() {
    this.disposed = true;
    this.revision++;
    this.resetPoses();
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', this.onPageHide);
      window.removeEventListener('pageshow', this.onPageShow);
    }
    this.socket.removeAllListeners();
    this.socket.io.removeAllListeners();
    this.socket.disconnect();
  }
}
