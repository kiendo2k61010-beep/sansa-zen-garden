import { useSyncExternalStore } from 'react';
import type {
  Action,
  RoomInfo,
  AvatarStyle,
  Player,
  ChatMessage,
  Quality,
  WorldEvent,
} from '../shared/world';
import { parseRoom, ROOM_CAPACITY, roomKey } from '../shared/world';
const names = [
  'Mây an nhiên',
  'Gió bình yên',
  'Lá tĩnh lặng',
  'Sen thanh thản',
  'Nắng hiền hòa',
  'Trăng tự tại',
];
export function readSetting(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}
export function saveSetting(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Private browsing may deny storage. */
  }
}
const initialRoom = parseRoom(new URLSearchParams(location.search));
export type Panel = 'rooms' | 'audio' | 'beads' | 'settings' | 'help' | 'people' | 'inventory' | null;
export interface GameState {
  loading: number;
  loadingLabel: string;
  ready: boolean;
  error: string | null;
  name: string;
  color: string;
  avatar: AvatarStyle;
  joined: boolean;
  selfId: string;
  players: Player[];
  messages: ChatMessage[];
  worldEvents: WorldEvent[];
  blockedIds: string[];
  hiddenIds: string[];
  chatEnabled: boolean;
  chatOpen: boolean;
  visited: string[];
  interaction: string;
  fps: number;
  drawCalls: number;
  status: 'connecting' | 'online' | 'offline';
  room: RoomInfo;
  action: Action;
  seated: string | null;
  pendingSeat: string | null;
  bows: number;
  bowRunning: boolean;
  beads: number;
  panel: Panel;
  toast: string;
  x: number;
  z: number;
  online: number;
  meditationSeconds: number;
  quality: Quality;
  sound: boolean;
  volume: number;
  channels: Record<string, boolean>;
  started: boolean;
}
let state: GameState = {
  loading: 0,
  loadingLabel: 'Đang tải bộ dựng cảnh',
  ready: false,
  error: null,
  name: readSetting('an-nhien-name', names[Math.floor(Math.random() * names.length)]),
  color: readSetting('an-nhien-color', '#c88943'),
  avatar: (['dck', 'lotus', 'sage'].includes(readSetting('sansa-avatar', 'dck'))
    ? readSetting('sansa-avatar', 'dck')
    : 'dck') as AvatarStyle,
  joined: false,
  selfId: '',
  players: [],
  messages: [],
  worldEvents: [],
  blockedIds: [],
  hiddenIds: [],
  chatEnabled: true,
  chatOpen: false,
  visited: [],
  interaction: '',
  fps: 0,
  drawCalls: 0,
  status: 'connecting',
  room: { ...initialRoom, key: roomKey(initialRoom), count: 0, capacity: ROOM_CAPACITY },
  action: 'idle',
  seated: null,
  pendingSeat: null,
  bows: 0,
  bowRunning: false,
  beads: 0,
  panel: null,
  toast: '',
  x: 0,
  z: 17,
  online: 0,
  meditationSeconds: 0,
  quality: readSetting('an-nhien-quality', 'auto') as GameState['quality'],
  sound: false,
  volume: 0.45,
  channels: { wind: true, birds: true, bell: true, wood: false, music: false },
  started: false,
};
const listeners = new Set<() => void>();
export const getState = () => state;
export function setState(patch: Partial<GameState>) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
}
export function useGame() {
  return useSyncExternalStore((fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, getState);
}
let toastTimer: ReturnType<typeof setTimeout>;
export function toast(message: string) {
  clearTimeout(toastTimer);
  setState({ toast: message });
  toastTimer = setTimeout(() => setState({ toast: '' }), 4200);
}
