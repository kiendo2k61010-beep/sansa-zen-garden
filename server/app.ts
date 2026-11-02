import express from 'express';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { Server, type Socket } from 'socket.io';
import {
  BOW_DURATION,
  ROOM_CAPACITY,
  SEATS,
  INTERACTION_POINTS,
  roomKey,
  walkable,
  type Ack,
  type Action,
  type Player,
  type RoomInfo,
  type RoomSpec,
  type Snapshot,
  type AvatarStyle,
  type ChatMessage,
  type Pose,
  type WorldEvent,
  type WorldInteractionKind,
} from '../shared/world.ts';

interface RoomState {
  spec: RoomSpec;
  players: Map<string, Player>;
  seats: Map<string, string>;
  visibility: 'public' | 'private';
  invite?: string;
  messages: ChatMessage[];
  events: WorldEvent[];
  worldAt: Partial<Record<WorldInteractionKind, number>>;
  createdAt: number;
}
interface RateWindow {
  started: number;
  count: number;
}
interface Member {
  key: string | null;
  rates: Map<string, RateWindow>;
  sessionId: string | null;
  movementAt: number;
  movementCredit: number;
  lastChatAt: number;
  worldAt: Partial<Record<WorldInteractionKind, number>>;
}
interface TempleOptions {
  capacity?: number;
  broadcastHz?: number;
  staticDir?: string;
  maxConnections?: number;
  allowedOrigins?: string[];
  production?: boolean;
}
type Reply = ((ack: Ack) => void) | undefined;
const DEFAULT_ROOMS = ['an-nhien', 'truc-lam', 'tinh-tam'];
const ACTIONS = new Set<Action>(['idle', 'walk', 'run', 'sit', 'greet', 'bow', 'pray', 'wave']);
const AVATARS = new Set<AvatarStyle>(['dck', 'lotus', 'sage']);
const WORLD_DURATION = { bell: 8000, lantern: 60000 } as const;
const WORLD_ROOM_COOLDOWN = { bell: 2500, lantern: 800 } as const;
const identifier = /^[a-zA-Z0-9_-]+$/;
const colors = /^#[0-9a-fA-F]{6}$/;
const cleanText = (value: string) =>
  value
    .normalize('NFC')
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u001f\u007f<>\u202a-\u202e\u2066-\u2069]/g, '')
    .trim();
const profanity =
  /\b(fuck|shit|bitch|asshole|dm|dmm)\b|(?<![\p{L}\p{N}])(địt|đụ|lồn|cặc|đéo)(?![\p{L}\p{N}])/giu;
const filterChat = (value: string) => cleanText(value).replace(profanity, '***');
const validSpec = (data: Record<string, unknown> | null): data is Record<string, unknown> & RoomSpec =>
  !!data &&
  typeof data === 'object' &&
  typeof data.room === 'string' &&
  identifier.test(data.room) &&
  data.room.length <= 40 &&
  typeof data.region === 'string' &&
  identifier.test(data.region) &&
  data.region.length <= 16 &&
  Number.isInteger(data.instance) &&
  (data.instance as number) >= 0 &&
  (data.instance as number) <= 999;
const inviteMatches = (actual: string | undefined, supplied: unknown) => {
  if (
    !actual ||
    typeof supplied !== 'string' ||
    !/^[a-zA-Z0-9_-]+$/.test(supplied) ||
    actual.length !== supplied.length
  )
    return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(supplied));
};
const sweptWalkable = (from: Pose, x: number, z: number) => {
  const count = Math.max(1, Math.ceil(Math.hypot(x - from.x, z - from.z) / 0.15));
  for (let i = 1; i <= count; i++)
    if (!walkable(from.x + ((x - from.x) * i) / count, from.z + ((z - from.z) * i) / count)) return false;
  return true;
};

/** In-memory, server-authoritative room and seat state. Region is a namespace, not geo routing. */
export function createTempleServer(options: TempleOptions = {}) {
  const capacity = options.capacity ?? ROOM_CAPACITY;
  const production = options.production ?? process.env.NODE_ENV === 'production';
  const allowedOrigins = new Set(
    options.allowedOrigins ??
      [process.env.PUBLIC_ORIGIN, ...(process.env.ALLOWED_ORIGINS || '').split(',')]
        .filter(Boolean)
        .map((origin) => origin!.trim().replace(/\/$/, '')),
  );
  const maxConnections = options.maxConnections ?? Math.max(24, Number(process.env.MAX_CONNECTIONS) || 240);
  const startedAt = Date.now();
  const counters = { joins: 0, disconnects: 0, rejectedPoses: 0, messages: 0, rejectedJoins: 0 };
  const originAllowed = (request: IncomingMessage) => {
    const origin = request.headers.origin;
    if (!origin) return true; // Non-browser clients still pass all protocol validation.
    try {
      const parsed = new URL(origin);
      if (!['http:', 'https:'].includes(parsed.protocol)) return false;
      if (allowedOrigins.has(parsed.origin)) return true;
      if (parsed.host === request.headers.host) return true;
      return !production && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    } catch {
      return false;
    }
  };
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'SAMEORIGIN',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    });
    next();
  });
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    maxHttpBufferSize: 8192,
    pingTimeout: 10000,
    pingInterval: 15000,
    cors: (request, callback) =>
      callback(null, { origin: originAllowed(request as IncomingMessage), credentials: false }),
    allowRequest: (request, callback) => callback(null, originAllowed(request)),
  });
  const rooms = new Map<string, RoomState>();
  const members = new Map<string, Member>();
  const sessions = new Map<string, string>();
  const info = (room: RoomState): RoomInfo => ({
    ...room.spec,
    key: roomKey(room.spec),
    count: room.players.size,
    capacity,
    visibility: room.visibility,
  });
  const snapshot = (room: RoomState, selfId: string): Snapshot => ({
    selfId,
    room: info(room),
    // Millimetre/radian precision is sufficient on the wire; simulation keeps the original values.
    players: [...room.players.values()].map((player) => ({
      ...player,
      x: Math.round(player.x * 1000) / 1000,
      z: Math.round(player.z * 1000) / 1000,
      rotation: Math.round(player.rotation * 1000) / 1000,
    })),
    seats: Object.fromEntries(room.seats),
    serverTime: Date.now(),
  });
  const activeWorldEvents = (room: RoomState) => {
    const now = Date.now();
    room.events = room.events.filter((event) => now - event.at < WORLD_DURATION[event.kind]);
    return room.events;
  };
  const broadcast = (room: RoomState) => {
    // Build the immutable room payload once; only the recipient ID differs.
    const state = snapshot(room, '');
    for (const id of room.players.keys()) io.to(id).emit('snapshot', { ...state, selfId: id });
  };
  const getRoom = (socket: Socket) => {
    const key = members.get(socket.id)?.key;
    return key ? rooms.get(key) : undefined;
  };
  const allow = (socket: Socket, key: string, count: number, windowMs: number) => {
    const member = members.get(socket.id);
    if (!member) return false;
    const now = Date.now();
    let rate = member.rates.get(key);
    if (!rate || now - rate.started >= windowMs) {
      rate = { started: now, count: 0 };
      member.rates.set(key, rate);
    }
    return ++rate.count <= count;
  };
  const reply = (callback: unknown, value: Ack) => {
    if (typeof callback === 'function') (callback as Reply)?.(value);
  };
  const releaseSeat = (room: RoomState, player: Player) => {
    if (player.seatId && room.seats.get(player.seatId) === player.id) room.seats.delete(player.seatId);
    player.seatId = null;
    player.action = 'idle';
    player.actionAt = Date.now();
  };
  const leave = (socket: Socket) => {
    const member = members.get(socket.id);
    const room = getRoom(socket);
    if (!member || !room) return;
    const player = room.players.get(socket.id);
    if (player) releaseSeat(room, player);
    room.players.delete(socket.id);
    void socket.leave(member.key!);
    if (player) io.to(member.key!).emit('presence', { id: player.id, name: player.name, kind: 'leave' });
    member.key = null;
    if (room.players.size === 0 && room.visibility === 'public') rooms.delete(roomKey(room.spec));
    else broadcast(room);
  };

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'an-nhien-temple',
      players: [...rooms.values()].reduce((sum, room) => sum + room.players.size, 0),
      connections: io.engine.clientsCount,
      rooms: rooms.size,
      regionMode: 'namespace',
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
      capacityPerRoom: capacity,
      maxConnections,
      counters: { ...counters },
    });
  });
  app.get('/api/rooms', (req, res) => {
    const region = req.query.region === undefined ? 'apac' : req.query.region;
    if (typeof region !== 'string' || !identifier.test(region) || region.length > 16) {
      res.status(400).json({ error: 'Vùng không hợp lệ.' });
      return;
    }
    const list = new Map<string, RoomInfo>();
    for (const room of DEFAULT_ROOMS) {
      const spec = { room, instance: 0, region };
      list.set(roomKey(spec), { ...spec, key: roomKey(spec), count: 0, capacity });
    }
    for (const room of rooms.values())
      if (room.spec.region === region && room.visibility === 'public')
        list.set(roomKey(room.spec), info(room));
    res.set('Cache-Control', 'no-store').json([...list.values()]);
  });
  const staticDir = resolve(options.staticDir ?? 'dist');
  app.use(express.static(staticDir, { index: 'index.html' }));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      res.status(404).json({ error: 'Không tìm thấy API.' });
      return;
    }
    if (existsSync(resolve(staticDir, 'index.html'))) res.sendFile(resolve(staticDir, 'index.html'));
    else res.status(503).send('Frontend chưa được build. Chạy npm run dev hoặc npm run build.');
  });

  io.on('connection', (socket) => {
    if (members.size >= maxConnections) {
      socket.emit('server:full');
      socket.disconnect(true);
      return;
    }
    members.set(socket.id, {
      key: null,
      rates: new Map(),
      sessionId: null,
      movementAt: Date.now(),
      movementCredit: 0.25,
      lastChatAt: 0,
      worldAt: {},
    });
    socket.on('create-room', (payload: unknown, callback: Reply) => {
      if (!allow(socket, 'create-room', 3, 60000)) {
        reply(callback, { ok: false, error: 'Bạn tạo phòng quá nhanh. Hãy đợi một phút.' });
        return;
      }
      const data = payload as Record<string, unknown> | null;
      const spec = {
        room: data?.room || `sansa-${randomBytes(5).toString('hex')}`,
        instance: data?.instance ?? 0,
        region: data?.region ?? 'apac',
      };
      if (!validSpec(spec) || !data || !['public', 'private'].includes(data.visibility as string)) {
        reply(callback, { ok: false, error: 'Thông tin tạo phòng không hợp lệ.' });
        return;
      }
      const key = roomKey(spec);
      if (rooms.has(key) || (spec.instance === 0 && DEFAULT_ROOMS.includes(spec.room))) {
        reply(callback, { ok: false, error: 'Tên phòng đã được sử dụng. Hãy chọn tên khác.' });
        return;
      }
      const visibility = data.visibility as 'public' | 'private';
      const invite = visibility === 'private' ? randomBytes(24).toString('base64url') : undefined;
      rooms.set(key, {
        spec,
        visibility,
        invite,
        players: new Map(),
        seats: new Map(),
        messages: [],
        events: [],
        worldAt: {},
        createdAt: Date.now(),
      });
      reply(callback, { ok: true, room: { ...spec, ...(invite ? { invite } : {}) } });
    });
    socket.on('join', (payload: unknown, callback: Reply) => {
      if (!allow(socket, 'join', 8, 10000)) {
        reply(callback, { ok: false, error: 'Bạn đổi phòng quá nhanh. Vui lòng chờ một chút.' });
        return;
      }
      const data = payload as Record<string, unknown> | null;
      if (!validSpec(data)) {
        reply(callback, { ok: false, error: 'Thông tin phòng không hợp lệ.' });
        return;
      }
      const spec: RoomSpec = { room: data.room, instance: data.instance as number, region: data.region };
      const key = roomKey(spec);
      let room = rooms.get(key);
      const member = members.get(socket.id)!;
      const sessionId = data.sessionId === undefined ? socket.id : data.sessionId;
      if (
        typeof sessionId !== 'string' ||
        !/^[a-zA-Z0-9_-]{8,128}$/.test(sessionId) ||
        (member.sessionId && member.sessionId !== sessionId) ||
        (sessions.has(sessionId) && sessions.get(sessionId) !== socket.id)
      ) {
        counters.rejectedJoins++;
        reply(callback, { ok: false, error: 'Phiên này đã được sử dụng. Hãy mở một trang mới để tham gia.' });
        return;
      }
      if (
        (room?.visibility === 'private' && !inviteMatches(room.invite, data.invite)) ||
        (!room && data.invite !== undefined)
      ) {
        counters.rejectedJoins++;
        reply(callback, { ok: false, error: 'Link mời không hợp lệ hoặc phòng riêng đã hết hạn.' });
        return;
      }
      if (room && !room.players.has(socket.id) && room.players.size >= capacity) {
        reply(callback, { ok: false, error: 'Phòng đã đầy. Mời bạn chọn phòng khác.' });
        return;
      }
      const name = typeof data.name === 'string' ? cleanText(data.name).slice(0, 28) : '';
      const color = typeof data.color === 'string' && colors.test(data.color) ? data.color : '#b97847';
      const avatar = AVATARS.has(data.avatar as AvatarStyle) ? (data.avatar as AvatarStyle) : 'dck';
      if (members.get(socket.id)?.key === key && room) {
        const player = room.players.get(socket.id)!;
        player.name = name || 'Mây an nhiên';
        player.color = color;
        player.avatar = avatar;
        reply(callback, { ok: true, snapshot: snapshot(room, socket.id) });
        broadcast(room);
        return;
      }
      leave(socket);
      if (!room) {
        room = {
          spec,
          players: new Map(),
          seats: new Map(),
          visibility: 'public',
          messages: [],
          events: [],
          worldAt: {},
          createdAt: Date.now(),
        };
        rooms.set(key, room);
      }
      const index = room.players.size;
      const player: Player = {
        id: socket.id,
        name: name || 'Mây an nhiên',
        color,
        x: ((index % 5) - 2) * 1.1,
        z: 14 + Math.floor(index / 5) * 1.1,
        rotation: Math.PI,
        action: 'idle',
        actionAt: Date.now(),
        seatId: null,
        avatar,
      };
      room.players.set(socket.id, player);
      members.get(socket.id)!.key = key;
      member.sessionId = sessionId;
      sessions.set(sessionId, socket.id);
      member.movementAt = Date.now();
      member.movementCredit = 0.25;
      counters.joins++;
      void socket.join(key);
      reply(callback, { ok: true, snapshot: snapshot(room, socket.id) });
      socket.to(key).emit('presence', { id: player.id, name: player.name, kind: 'join' });
      broadcast(room);
    });

    socket.on('pose', (payload: unknown, callback?: Reply) => {
      if (!allow(socket, 'pose', 35, 1000)) {
        reply(callback, { ok: false, error: 'Quá nhiều cập nhật vị trí.' });
        return;
      }
      const room = getRoom(socket);
      const player = room?.players.get(socket.id);
      if (!room || !player) {
        reply(callback, { ok: false, error: 'Bạn chưa tham gia phòng.' });
        return;
      }
      const rejectPose = (error: string) => {
        counters.rejectedPoses++;
        const { x, z, rotation, action, actionAt } = player;
        socket.emit('correction', { x, z, rotation, action, actionAt });
        reply(callback, { ok: false, error });
      };
      const pose = payload as Record<string, unknown> | null;
      if (
        !pose ||
        typeof pose !== 'object' ||
        typeof pose.x !== 'number' ||
        typeof pose.z !== 'number' ||
        typeof pose.rotation !== 'number' ||
        !Number.isFinite(pose.rotation) ||
        !walkable(pose.x, pose.z) ||
        !ACTIONS.has(pose.action as Action)
      ) {
        rejectPose('Vị trí không hợp lệ.');
        return;
      }
      if (player.seatId) {
        socket.emit('correction', {
          x: player.x,
          z: player.z,
          rotation: player.rotation,
          action: player.action,
          actionAt: player.actionAt,
        });
        reply(callback, { ok: true, snapshot: snapshot(room, socket.id) });
        return;
      }
      if (pose.action === 'sit') {
        rejectPose('Hãy chọn một bồ đoàn trống để ngồi.');
        return;
      }
      const member = members.get(socket.id)!;
      const now = Date.now();
      // Time credit absorbs packet jitter without granting a fresh distance allowance per packet.
      member.movementCredit = Math.min(
        0.55,
        member.movementCredit + Math.max(0, now - member.movementAt) / 1000,
      );
      member.movementAt = now;
      const distance = Math.hypot(player.x - pose.x, player.z - pose.z);
      const speed = pose.action === 'run' ? 5.8 : 3.5;
      if (distance > member.movementCredit * speed + 0.04 || !sweptWalkable(player, pose.x, pose.z)) {
        rejectPose('Di chuyển vượt tốc độ hoặc xuyên vật cản. Vị trí đã được đồng bộ lại.');
        return;
      }
      // Preserve tiny negative credit so the numeric tolerance cannot be farmed per packet.
      member.movementCredit -= distance / speed;
      const moved = distance > 0.025;
      player.x = pose.x;
      player.z = pose.z;
      player.rotation = Math.atan2(Math.sin(pose.rotation), Math.cos(pose.rotation));
      // A pose cannot manufacture a greeting/bow or overwrite its server timestamp.
      if (
        (moved && ['walk', 'run', 'idle'].includes(pose.action as string)) ||
        !['greet', 'bow', 'pray', 'wave'].includes(player.action)
      ) {
        const nextAction = pose.action === 'walk' || pose.action === 'run' ? pose.action : 'idle';
        if (nextAction !== player.action) player.actionAt = Date.now();
        player.action = nextAction;
      }
      reply(callback, { ok: true });
    });

    socket.on('seat:claim', (payload: unknown, callback: Reply) => {
      if (!allow(socket, 'seat', 12, 1000)) {
        reply(callback, { ok: false, error: 'Vui lòng thao tác chậm hơn.' });
        return;
      }
      const room = getRoom(socket);
      const player = room?.players.get(socket.id);
      if (!room || !player) {
        reply(callback, { ok: false, error: 'Bạn chưa tham gia phòng.' });
        return;
      }
      const seatId = (payload as { seatId?: unknown } | null)?.seatId;
      const seat = SEATS.find((item) => item.id === seatId);
      if (!seat) {
        reply(callback, { ok: false, error: 'Bồ đoàn không tồn tại.' });
        return;
      }
      const occupant = room.seats.get(seat.id);
      if (occupant && occupant !== socket.id) {
        reply(callback, { ok: false, error: 'Bồ đoàn này đã có người ngồi.' });
        return;
      }
      if (Math.hypot(player.x - seat.x, player.z - seat.z) > 1.6) {
        reply(callback, { ok: false, error: 'Hãy đến gần bồ đoàn trước khi ngồi.' });
        return;
      }
      // These operations are synchronous: competing claims cannot interleave.
      releaseSeat(room, player);
      room.seats.set(seat.id, socket.id);
      Object.assign(player, {
        x: seat.x,
        z: seat.z,
        rotation: seat.rotation,
        seatId: seat.id,
        action: 'sit',
        actionAt: Date.now(),
      });
      reply(callback, { ok: true, snapshot: snapshot(room, socket.id) });
      broadcast(room);
    });
    socket.on('seat:release', (payloadOrCallback: unknown, suppliedCallback?: Reply) => {
      const callback = typeof payloadOrCallback === 'function' ? payloadOrCallback : suppliedCallback;
      if (!allow(socket, 'seat', 12, 1000)) {
        reply(callback, { ok: false, error: 'Vui lòng thao tác chậm hơn.' });
        return;
      }
      const room = getRoom(socket);
      const player = room?.players.get(socket.id);
      if (!room || !player) {
        reply(callback, { ok: false, error: 'Bạn chưa tham gia phòng.' });
        return;
      }
      releaseSeat(room, player);
      reply(callback, { ok: true, snapshot: snapshot(room, socket.id) });
      broadcast(room);
    });
    socket.on('action', (payload: unknown, callback?: Reply) => {
      if (!allow(socket, 'action', 8, 1000)) {
        reply(callback, { ok: false, error: 'Vui lòng thao tác chậm hơn.' });
        return;
      }
      const room = getRoom(socket);
      const player = room?.players.get(socket.id);
      if (!room || !player) {
        reply(callback, { ok: false, error: 'Bạn chưa tham gia phòng.' });
        return;
      }
      const action = (payload as { action?: unknown } | null)?.action;
      if (
        action !== 'idle' &&
        action !== 'greet' &&
        action !== 'bow' &&
        action !== 'pray' &&
        action !== 'wave'
      ) {
        reply(callback, { ok: false, error: 'Thao tác không hợp lệ.' });
        return;
      }
      if (player.seatId && action !== 'idle') {
        reply(callback, { ok: false, error: 'Hãy đứng dậy trước khi thực hiện động tác.' });
        return;
      }
      if (
        action === 'pray' &&
        Math.hypot(player.x - INTERACTION_POINTS.altar.x, player.z - INTERACTION_POINTS.altar.z) >
          INTERACTION_POINTS.altar.radius
      ) {
        reply(callback, { ok: false, error: 'Hãy đến gần tượng Phật để cầu nguyện.' });
        return;
      }
      const now = Date.now();
      if (
        action === player.action &&
        action !== 'idle' &&
        now - player.actionAt < (action === 'bow' ? BOW_DURATION - 60 : 1400)
      ) {
        reply(callback, { ok: false, error: 'Động tác đang diễn ra.' });
        return;
      }
      player.action = player.seatId ? 'sit' : action;
      player.actionAt = now;
      if (action === 'greet' || action === 'wave')
        io.to(roomKey(room.spec)).emit('greet', {
          id: player.id,
          name: player.name,
          x: player.x,
          z: player.z,
        });
      reply(callback, { ok: true, snapshot: snapshot(room, socket.id) });
      broadcast(room);
    });
    socket.on('leave', (payloadOrCallback?: unknown, suppliedCallback?: Reply) => {
      const callback = typeof payloadOrCallback === 'function' ? payloadOrCallback : suppliedCallback;
      leave(socket);
      reply(callback, { ok: true });
    });
    socket.on('chat:send', (payload: unknown, callback: Reply) => {
      const room = getRoom(socket);
      const player = room?.players.get(socket.id);
      const member = members.get(socket.id)!;
      if (!room || !player) {
        reply(callback, { ok: false, error: 'Bạn chưa tham gia phòng.' });
        return;
      }
      const value = (payload as { text?: unknown } | null)?.text;
      if (typeof value !== 'string' || value.length > 200 || !cleanText(value)) {
        reply(callback, { ok: false, error: 'Tin nhắn cần có từ 1 đến 200 ký tự.' });
        return;
      }
      if (!allow(socket, 'chat', 8, 15000) || Date.now() - member.lastChatAt < 1200) {
        reply(callback, { ok: false, error: 'Hãy gửi tin nhắn chậm hơn để giữ không gian yên tĩnh.' });
        return;
      }
      member.lastChatAt = Date.now();
      const message: ChatMessage = {
        id: randomUUID(),
        playerId: player.id,
        name: player.name,
        text: filterChat(value),
        sentAt: member.lastChatAt,
      };
      room.messages.push(message);
      if (room.messages.length > 50) room.messages.shift();
      counters.messages++;
      io.to(roomKey(room.spec)).emit('chat', message);
      reply(callback, { ok: true });
    });
    socket.on('chat:history', (_payload: unknown, callback: Reply) => {
      const room = getRoom(socket);
      if (!room || !allow(socket, 'history', 4, 1000)) {
        reply(callback, { ok: false, error: 'Chưa thể tải tin nhắn.' });
        return;
      }
      reply(callback, { ok: true, messages: room.messages.map((message) => ({ ...message })) });
    });
    socket.on('world:interact', (payload: unknown, callback: Reply) => {
      if (!allow(socket, 'world:interact', 8, 10000)) {
        reply(callback, { ok: false, error: 'Hãy tương tác chậm hơn để giữ không gian yên tĩnh.' });
        return;
      }
      const room = getRoom(socket);
      const player = room?.players.get(socket.id);
      const member = members.get(socket.id)!;
      if (!room || !player) {
        reply(callback, { ok: false, error: 'Bạn chưa tham gia phòng.' });
        return;
      }
      const kind = (payload as { kind?: unknown } | null)?.kind;
      if (kind !== 'bell' && kind !== 'lantern') {
        reply(callback, { ok: false, error: 'Tương tác không hợp lệ.' });
        return;
      }
      if (player.seatId || ['sit', 'bow', 'pray'].includes(player.action)) {
        reply(callback, { ok: false, error: 'Hãy đứng dậy trước khi tương tác.' });
        return;
      }
      const point = INTERACTION_POINTS[kind];
      if (Math.hypot(player.x - point.x, player.z - point.z) > point.radius) {
        reply(callback, {
          ok: false,
          error:
            kind === 'bell'
              ? 'Hãy đến gần chuông trước khi thỉnh chuông.'
              : 'Hãy đến bờ hồ sen để thả hoa đăng.',
        });
        return;
      }
      const now = Date.now();
      if (
        now - (member.worldAt[kind] ?? 0) < 4000 ||
        now - (room.worldAt[kind] ?? 0) < WORLD_ROOM_COOLDOWN[kind]
      ) {
        reply(callback, {
          ok: false,
          error:
            kind === 'bell'
              ? 'Xin chờ tiếng chuông ngân rồi thỉnh tiếp.'
              : 'Xin chờ một chút trước khi thả thêm hoa đăng.',
        });
        return;
      }
      member.worldAt[kind] = now;
      room.worldAt[kind] = now;
      const event: WorldEvent = { id: randomUUID(), kind, playerId: player.id, name: player.name, at: now };
      activeWorldEvents(room).push(event);
      if (room.events.length > 40) room.events.splice(0, room.events.length - 40);
      io.to(roomKey(room.spec)).emit('world:event', event);
      reply(callback, { ok: true, events: [{ ...event }] });
    });
    socket.on('world:history', (_payload: unknown, callback: Reply) => {
      const room = getRoom(socket);
      if (!room || !allow(socket, 'world:history', 4, 1000)) {
        reply(callback, { ok: false, error: 'Chưa thể tải hoạt động trong phòng.' });
        return;
      }
      reply(callback, { ok: true, events: activeWorldEvents(room).map((event) => ({ ...event })) });
    });
    socket.on('disconnect', () => {
      leave(socket);
      const sessionId = members.get(socket.id)?.sessionId;
      if (sessionId && sessions.get(sessionId) === socket.id) sessions.delete(sessionId);
      members.delete(socket.id);
      counters.disconnects++;
    });
  });

  const interval = setInterval(
    () => {
      const now = Date.now();
      for (const room of rooms.values()) {
        for (const player of room.players.values()) {
          if (
            (['greet', 'wave'].includes(player.action) && now - player.actionAt >= 2200) ||
            (player.action === 'pray' && now - player.actionAt >= 7000) ||
            (player.action === 'bow' && now - player.actionAt >= BOW_DURATION)
          ) {
            player.action = 'idle';
            player.actionAt = now;
          }
        }
        broadcast(room);
        if (!room.players.size && now - room.createdAt > 6 * 60 * 60 * 1000) rooms.delete(roomKey(room.spec));
      }
    },
    1000 / (options.broadcastHz ?? 12),
  );
  interval.unref();

  return {
    app,
    httpServer,
    io,
    rooms,
    listen: (port = 0, host = '127.0.0.1') =>
      new Promise<number>((resolvePort, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(port, host, () => {
          httpServer.off('error', reject);
          const address = httpServer.address();
          resolvePort(typeof address === 'object' && address ? address.port : port);
        });
      }),
    close: () =>
      new Promise<void>((resolveClose) => {
        clearInterval(interval);
        io.close(() => {
          rooms.clear();
          members.clear();
          sessions.clear();
          resolveClose();
        });
      }),
  };
}
