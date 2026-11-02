export type Action = 'idle' | 'walk' | 'run' | 'sit' | 'greet' | 'bow' | 'pray' | 'wave';
export type AvatarStyle = 'dck' | 'lotus' | 'sage';
export type Quality = 'auto' | 'low' | 'medium' | 'high';
export type WorldInteractionKind = 'bell' | 'lantern';
export interface WorldEvent {
  id: string;
  kind: WorldInteractionKind;
  playerId: string;
  name: string;
  at: number;
}
export interface ChatMessage {
  id: string;
  playerId: string;
  name: string;
  text: string;
  sentAt: number;
}
export interface PresenceEvent {
  id: string;
  name: string;
  kind: 'join' | 'leave';
}
export interface Pose {
  x: number;
  z: number;
  rotation: number;
  action: Action;
  actionAt: number;
}
export interface Player extends Pose {
  id: string;
  name: string;
  color: string;
  seatId: string | null;
  avatar?: AvatarStyle;
}
export interface RoomSpec {
  room: string;
  instance: number;
  region: string;
  invite?: string;
}
export interface RoomInfo extends RoomSpec {
  key: string;
  count: number;
  capacity: number;
  visibility?: 'public' | 'private';
}
export interface Snapshot {
  selfId: string;
  players: Player[];
  seats: Record<string, string>;
  room: RoomInfo;
  serverTime: number;
}
export type Ack = {
  ok: boolean;
  error?: string;
  snapshot?: Snapshot;
  room?: RoomSpec;
  messages?: ChatMessage[];
  events?: WorldEvent[];
};
export const INTERACTION_POINTS = {
  altar: { x: 0, z: -6.2, radius: 3.4 },
  bath: { x: 21, z: -16, radius: 3.2 },
  market: { x: -21, z: 20, radius: 4.5 },
  bell: { x: -16, z: 10.5, radius: 2.2 },
  lantern: { x: 8.4, z: 13, radius: 2.0 },
};
export const LANDMARKS = [
  { id: 'temple', name: 'Chính điện', x: 0, z: 5 },
  { id: 'garden', name: 'Vườn sen', x: 8.4, z: 19.5 },
  { id: 'forest', name: 'Rừng tĩnh lặng', x: -23, z: -14 },
  { id: 'bath', name: 'Nhà tắm', x: 21, z: -13 },
  { id: 'market', name: 'Hội chợ', x: -21, z: 20 },
  { id: 'bell', name: 'Chuông chùa', x: -16, z: 10.5 },
  { id: 'lantern', name: 'Hồ sen', x: 8.4, z: 13 },
] as const;
export const ROOM_CAPACITY = 24;
export const BOW_DURATION = 4200;
export const SEATS = [-4, 0, 4].flatMap((z, row) =>
  [-6, -2, 2, 6].map((x, col) => ({ id: `seat-${row}-${col}`, x, z, y: 0.66, rotation: Math.PI })),
);
export type Obstacle = { x: number; z: number; hx: number; hz: number };
export const OBSTACLES: Obstacle[] = [
  { x: 0, z: -10, hx: 3.45, hz: 2.2 },
  { x: 0, z: -13.5, hx: 10.4, hz: 0.3 },
  ...[-9.5, 9.5].flatMap((x) => [-11, -4, 3, 8.5].map((z) => ({ x, z, hx: 0.57, hz: 0.57 }))),
  // The open side bays have solid low timber screens; gaps between bays remain entrances.
  ...[-9.5, 9.5].flatMap((x) => [-8, -0.5, 5.7].map((z) => ({ x, z, hx: 0.1, hz: 1.9 }))),
  ...[-4.3, 4.3].map((x) => ({ x, z: -12.1, hx: 0.23, hz: 0.23 })),
  { x: -16, z: 4, hx: 3.8, hz: 5.2 },
  { x: 16, z: -6, hx: 3.2, hz: 3.2 },
  { x: 14, z: 13, hx: 4.7, hz: 3.5 },
  { x: -12, z: 17, hx: 1, hz: 1 },
  { x: 10, z: 22, hx: 1.2, hz: 1.2 },
  ...[-6.9, 6.9].flatMap((x) => [12.4, 20, 26].map((z) => ({ x, z, hx: 0.45, hz: 0.45 }))),
  ...[-18, 18].map((x) => ({ x, z: 29, hx: 11.35, hz: 0.425 })),
  { x: 21, z: -19.2, hx: 3.6, hz: 0.12 },
  { x: 17.4, z: -16.2, hx: 0.12, hz: 3 },
  { x: 24.6, z: -16.2, hx: 0.12, hz: 3 },
  { x: 18.5, z: -13.2, hx: 1.1, hz: 0.12 },
  { x: 23.5, z: -13.2, hx: 1.1, hz: 0.12 },
  ...[17.4, 24.6].flatMap((x) => [-19.2, -13.2].map((z) => ({ x, z, hx: 0.27, hz: 0.27 }))),
  { x: 19.2, z: -17.3, hx: 1.15, hz: 1.15 },
  { x: 22.8, z: -17.3, hx: 1.15, hz: 1.15 },
  { x: 21, z: -18.7, hx: 0.45, hz: 0.4 },
  { x: -24.6, z: 17.4, hx: 1.6, hz: 1.1 },
  { x: -17.4, z: 17.4, hx: 1.6, hz: 1.1 },
  { x: -21, z: 24.8, hx: 1.6, hz: 1.1 },
  { x: -24.6, z: 23, hx: 1.3, hz: 0.35 },
  { x: -17.4, z: 23, hx: 1.3, hz: 0.35 },
];
export function groundHeight(x: number, z: number) {
  if (Math.abs(x) < 10.5 && z >= -13.8 && z <= 9) return 0.6;
  if (Math.abs(x) < 6 && z > 9 && z < 12) return z < 10 ? 0.45 : z < 11 ? 0.3 : 0.15;
  return 0;
}
export function walkable(x: number, z: number, r = 0.43) {
  return (
    Number.isFinite(x) &&
    Number.isFinite(z) &&
    Math.abs(x) < 28 - r &&
    z > -22 + r &&
    z < 29 - r &&
    !OBSTACLES.some((o) => Math.abs(x - o.x) < o.hx + r && Math.abs(z - o.z) < o.hz + r)
  );
}
export function roomKey(r: RoomSpec) {
  return `${r.region}:${r.room}:${r.instance}`;
}
export function parseRoom(params: URLSearchParams): RoomSpec {
  return {
    room: (params.get('room') || 'an-nhien').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'an-nhien',
    instance: Math.max(0, Math.min(999, Math.floor(Number(params.get('instance')) || 0))),
    region: (params.get('region') || 'apac').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16) || 'apac',
    ...(params.get('invite')
      ? {
          invite: params
            .get('invite')!
            .replace(/[^a-zA-Z0-9_-]/g, '')
            .slice(0, 128),
        }
      : {}),
  };
}
